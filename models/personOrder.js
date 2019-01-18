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
      insertDate: {
        type: DataTypes.INTEGER,
        field: 'insert_date',
        defaultValue: helper.getDate(),
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

  static deleteById(oid) {
    return this.destroy({
      where: {
        id: { [Op.eq]: oid },
        deleteDate: { [Op.eq]: 0 },
      },
    });
  }
}

module.exports = PersonOrder;
