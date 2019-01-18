/**
 * Created by woods on 1/18/19.
 */

const Sequelize = require('sequelize');
const config = require('config');

const sequelize = new Sequelize('main', '', '', {
  dialect: 'sqlite',
  operatorsAliases: false,
  storage: config.get('database.order.file'),
});

const PersonModel = require('./person');
const DailyModel = require('./daily');
const MenuModel = require('./menu');
const DailyMenuModel = require('./dailyMenu');
const PersonOrderModel = require('./personOrder');
const PersonOrderMenuModel = require('./personOrderMenu');
const SettingsModel = require('./settings');

const models = {
  Person: PersonModel.init(sequelize, Sequelize),
  Daily: DailyModel.init(sequelize, Sequelize),
  Menu: MenuModel.init(sequelize, Sequelize),
  DailyMenu: DailyMenuModel.init(sequelize, Sequelize),
  PersonOrder: PersonOrderModel.init(sequelize, Sequelize),
  PersonOrderMenu: PersonOrderMenuModel.init(sequelize, Sequelize),
  Settings: SettingsModel.init(sequelize, Sequelize),
};

Object.values(models)
  .filter((model) => typeof model.associate === 'function')
  .forEach((model) => model.associate(models));

const db = {
  ...models,
  sequelize,
};

/**
 *
 * @type {{Person: *, Daily: *, Menu: *, DailyMenu: *, PersonOrder: *, PersonOrderMenu: *, sequelize: *|Sequelize}}
 */
module.exports = db;
