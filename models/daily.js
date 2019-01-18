/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');
const helper = require('../lib/helper');

const Op = Sequelize.Op;

class Daily extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    const table = {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      orderDate: {
        type: DataTypes.INTEGER,
        field: 'order_date',
      },
      list: DataTypes.TEXT,
      isPrimary: {
        type: DataTypes.CHAR,
        field: 'is_primary',
      },
      maxCount: {
        type: DataTypes.INTEGER,
        field: 'max_count',
      },
      priority: DataTypes.INTEGER,
      isOpen: {
        type: DataTypes.CHAR,
        field: 'is_open',
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
      indexes: [
        {
          name: 'daily_order_date_is_primary_delete_date_uindex',
          unique: true,
          fields: ['order_date', 'is_primary', 'delete_date'],
        },
      ],
      underscored: true,
      tableName: 'daily',
      timestamps: false,
      paranoid: false,
      sequelize,
    };

    return super.init(table, options);
  }

  static associate(models) {
    this.myAssociation = this.belongsToMany(models.Menu, {
      through: models.DailyMenu,
      as: 'menu',
      where: { deleteDate: { [Op.eq]: 0 } },
    });
  }

  static getAssociate() {
    return this.myAssociation;
  }

  static getWithId(id) {
    return this.findOne({
      where: {
        id: { [Op.eq]: id },
        deleteDate: { [Op.eq]: 0 },
      },
    });
  }

  static getAll(type) {
    const where = {
      deleteDate: { [Op.eq]: 0 },
    };
    if (type) where['isPrimary'] = { [Op.eq]: type };

    return this.findAll({
      include: this.myAssociation,
      where,
      order: [['insert_date', 'DESC']],
    });
  }

  static getWithFilter(date, type) {
    const where = {
      orderDate: date,
      deleteDate: { [Op.eq]: 0 },
    };
    if (type) where['isPrimary'] = { [Op.eq]: type };

    return this.findAll({
      include: this.myAssociation,
      where,
      order: [['insert_date', 'DESC']],
    });
  }

  static getDailyMenuList(type, all, date, weekDate) {
    const where = {
      orderDate: {
        [Op.or]: [all, date, weekDate],
      },
      deleteDate: { [Op.eq]: 0 },
      isPrimary: type,
    };

    return this.findAll({
      include: this.myAssociation,
      where,
      order: [['priority', 'ASC'], ['insert_date', 'DESC']],
    });
  }
}

module.exports = Daily;
