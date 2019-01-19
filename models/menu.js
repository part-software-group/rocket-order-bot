/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');
const helper = require('../lib/helper');

const Op = Sequelize.Op;

class Menu extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    const table = {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: DataTypes.STRING(225),
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
      indexes: [
        {
          name: 'menu_name_uindex',
          unique: true,
          fields: ['name', 'delete_date'],
        },
      ],
      underscored: true,
      tableName: 'menu',
      timestamps: false,
      paranoid: false,
      sequelize,
    };

    return super.init(table, options);
  }

  static associate(models) {
    this.myAssociation = this.belongsToMany(models.Daily, {
      through: models.DailyMenu,
      as: 'daily',
      where: { deleteDate: { [Op.eq]: 0 } },
    });
    this.menu = this.hasOne(models.PersonOrderMenu, {
      as: 'menu',
    });
  }

  static getByName(name) {
    return this.findAll({
      where: {
        name,
        deleteDate: { [Op.eq]: 0 },
      },
      order: [['insert_date', 'DESC']],
    });
  }

  static getWithId(id) {
    return this.findOne({
      where: {
        id: { [Op.eq]: id },
        deleteDate: { [Op.eq]: 0 },
      },
    });
  }
}

module.exports = Menu;
