/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');
const helper = require('../lib/helper');

const Op = Sequelize.Op;

class PersonOrder extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    const table = {
      id: {
        type: DataTypes.STRING(225),
        primaryKey: true,
      },
      personId: {
        type: DataTypes.INTEGER,
        field: 'person_id',
      },
      lunchListId: {
        type: DataTypes.INTEGER,
        field: 'lunch_list_id',
      },
      rocketMessageId: {
        type: DataTypes.STRING(225),
        field: 'rocket_message_id',
      },
      rocketRoomId: {
        type: DataTypes.STRING(225),
        field: 'rocket_room_id',
      },
      menuList: {
        type: DataTypes.TEXT,
        field: 'menu_list',
      },
      insertDate: {
        type: DataTypes.INTEGER,
        field: 'insert_date',
      },
      deleteDate: {
        type: DataTypes.INTEGER,
        field: 'delete_date',
        defaultValue: 0,
      },
    };
    const options = {
      underscored: true,
      tableName: 'person_order',
      timestamps: false,
      paranoid: false,
      sequelize,
    };
    this._sequelize = sequelize;

    return super.init(table, options);
  }

  static associate(models) {
    this.person = this.belongsTo(models.Person, {
      as: 'person',
      targetKey: 'id',
      where: { deleteDate: { [Op.eq]: 0 } },
    });
    this.personOrderMenu = this.hasMany(models.PersonOrderMenu, {
      as: 'personOrderMenu',
      sourceKey: 'person_order_id',
      required: false,
      where: { deleteDate: { [Op.eq]: 0 } },
    });
    this.model = {
      personOrderMenu: models.PersonOrderMenu,
      person: models.Person,
      menu: models.Menu,
    };
  }

  static checkIdempotent(personId) {
    return this.count({
      where: {
        personId,
        insertDate: this._sequelize.where(
          this._sequelize.literal('insert_date/1000000000'),
          '=',
          Math.trunc(helper.getDate() / 1000000000),
        ),
        deleteDate: { [Op.eq]: 0 },
      },
      order: [['insert_date', 'DESC']],
    });
  }

  static getWithId(oid) {
    return this.findOne({
      where: {
        id: { [Op.eq]: oid },
        deleteDate: { [Op.eq]: 0 },
      },
    });
  }

  static findScheduleOrder() {
    return this.findAll({
      where: {
        insertDate: this._sequelize.where(
          this._sequelize.literal('`personOrder`.insert_date/1000000000'),
          '=',
          Math.trunc(helper.getDate() / 1000000000),
        ),
        deleteDate: { [Op.eq]: 0 },
      },
      include: this.personOrderMenu,
      order: [['insert_date', 'DESC']],
    });
  }

  static getDailyAnalysis() {
    return this.findAll({
      where: {
        insertDate: this._sequelize.where(
          this._sequelize.literal('`personOrder`.insert_date/1000000000'),
          '=',
          Math.trunc(helper.getDate() / 1000000000),
        ),
        deleteDate: { [Op.eq]: 0 },
      },
      group: ['person.id', 'personOrderMenu->menu.name'],
      attributes: ['rocketMessageId', 'menuList'],
      include: [
        {
          model: this.model.person,
          as: 'person',
          attributes: ['id', 'name'],
          where: { deleteDate: { [Op.eq]: 0 } },
        },
        {
          model: this.model.personOrderMenu,
          as: 'personOrderMenu',
          attributes: ['id'],
          required: false,
          include: [
            {
              model: this.model.menu,
              as: 'menu',
              attributes: ['id', 'name', [this._sequelize.fn('COUNT', 'name'), 'count']],
              where: { deleteDate: { [Op.eq]: 0 } },
            },
          ],
          where: { deleteDate: { [Op.eq]: 0 } },
        },
      ],
      order: [['insert_date', 'DESC']],
    });
  }

  /**
   *
   * @param {String} oid
   * @param {Object} messageId
   * @returns {*}
   */
  static updateRocketMessageId(oid, messageId) {
    return this.getWithId(oid).then((data) => {
      if (!data) return false;

      const rocketMessageId = JSON.stringify({
        ...JSON.parse(data.rocketMessageId),
        ...messageId,
      });

      return data.update({ rocketMessageId });
    });
  }

  static deleteById(oid) {
    return this.destroy({
      where: {
        id: { [Op.eq]: oid },
        deleteDate: { [Op.eq]: 0 },
      },
    });
  }

  static resetWithOid(oid, transaction) {
    return this.update(
      { deleteDate: helper.getDate() },
      {
        where: { deleteDate: { [Op.eq]: 0 }, id: { [Op.eq]: oid } },
        transaction,
      },
    );
  }
}

module.exports = PersonOrder;
