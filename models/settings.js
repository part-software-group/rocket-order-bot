/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');

const Op = Sequelize.Op;

class Settings extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    const table = {
      key: {
        type: DataTypes.STRING(225),
        primaryKey: true,
      },
      value: DataTypes.STRING(225),
    };
    const options = {
      underscored: true,
      tableName: 'settings',
      timestamps: false,
      paranoid: false,
      sequelize,
    };

    return super.init(table, options);
  }
}

module.exports = Settings;
