/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');
const helper = require('../lib/helper');

const Op = Sequelize.Op;

class Person extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    const table = {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      username: DataTypes.STRING(225),
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
      platform: DataTypes.STRING(50),
    };
    const options = {
      indexes: [
        {
          name: 'person_username_uindex',
          unique: true,
          fields: ['username', 'delete_date'],
        },
      ],
      underscored: true,
      tableName: 'person',
      timestamps: false,
      paranoid: false,
      sequelize,
    };

    return super.init(table, options);
  }

  static associate(models) {
    this.personOrder = this.hasMany(models.PersonOrder, {
      as: 'personOrder',
      sourceKey: 'person_id',
      where: { deleteDate: { [Op.eq]: 0 } },
    });
  }

  static getWithUsername(username) {
    return this.findAll({
      where: {
        username,
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

  static getAll() {
    return this.findAll({
      where: { deleteDate: { [Op.eq]: 0 } },
      order: [['insert_date', 'DESC']],
    });
  }

  static rm(username) {
    const where = { deleteDate: { [Op.eq]: 0 } };

    if (!isNaN(Number(username))) where.id = Number(username);
    else if (username.substr(0, 1) === '@') where.username = username.substr(1);
    else where.username = username;

    return this.update({ deleteDate: helper.getDate() }, { where });
  }
}

module.exports = Person;
