/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');
const helper = require('../lib/helper');

const Op = Sequelize.Op;

class PersonOrderMenu extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    const table = {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      personOrderId: {
        type: DataTypes.STRING(225),
        field: 'person_order_id',
      },
      menuId: {
        type: DataTypes.INTEGER,
        field: 'menu_id',
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
      tableName: 'person_order_menu',
      timestamps: false,
      paranoid: false,
      sequelize,
    };
    this._sequelize = sequelize;

    return super.init(table, options);
  }

  static associate(models) {
    this.personOrder = this.belongsTo(models.PersonOrder, {
      as: 'personOrder',
      targetKey: 'id',
      where: { deleteDate: { [Op.eq]: 0 } },
    });
    this.menu = this.belongsTo(models.Menu, {
      as: 'menu',
      where: { deleteDate: { [Op.eq]: 0 } },
    });
    this.model = {
      menu: models.Menu,
    };
  }

  static getAssociateMenu() {
    return this.menu;
  }

  static getCountOrderMenu(oid, mid) {
    return this.count({
      where: {
        personOrderId: { [Op.eq]: oid },
        menuId: { [Op.eq]: mid },
        deleteDate: { [Op.eq]: 0 },
      },
    });
  }

  static getGroupCountByOrderId(oid) {
    return this.findAll({
      where: {
        personOrderId: { [Op.eq]: oid },
        deleteDate: { [Op.eq]: 0 },
      },
      include: [
        {
          model: this.model.menu,
          as: 'menu',
          attributes: ['name', [this._sequelize.fn('COUNT', 'name'), 'count']],
        },
      ],
      group: ['person_order_id', 'menu_id'],
      attributes: ['person_order_id'],
    });
  }

  static resetWithOid(oid, transaction) {
    return this.update(
      { deleteDate: helper.getDate() },
      {
        where: { deleteDate: { [Op.eq]: 0 }, personOrderId: { [Op.eq]: oid } },
        transaction,
      },
    );
  }
}

module.exports = PersonOrderMenu;
