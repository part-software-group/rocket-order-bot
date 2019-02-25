/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');
const helper = require('../lib/helper');

const Op = Sequelize.Op;

class DailyMenu extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    const table = {
      dailyId: {
        type: DataTypes.INTEGER,
        field: 'daily_id',
      },
      menuId: {
        type: DataTypes.INTEGER,
        field: 'menu_id',
      },
      maxCount: {
        type: DataTypes.INTEGER,
        field: 'max_count',
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
      tableName: 'daily_menu',
      timestamps: false,
      paranoid: false,
      sequelize,
    };

    return super.init(table, options);
  }
}

module.exports = DailyMenu;
