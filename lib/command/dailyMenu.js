/**
 * Created by woods on 1/17/19.
 */

const path = require('path');
const Promise = require('bluebird');
const program = require('commander');
const helper = require('../helper');
const db = require('../../models/index');

const command = path.basename(__filename, '.js');

const list = {
  filter: [],
  menu: [],
};

function optType(str) {
  if (str.match(/^(primary|p)$/i)) return '1';
  else if (str.match(/^(secondary|s)$/i)) return '0';
  return '';
}

function optFilter(val) {
  list.filter.push(val);

  return list.filter;
}

function optMenu(val) {
  list.menu.push(val);

  return list.menu;
}

program.option('-u, --user <user>');

program
  .command(`${command}Get`)
  .option('-a, --all')
  .option('-t, --type <type>', '', optType)
  .option('-f, --filter [date]', '', optFilter)
  .action((args) => {
    list.filter = [];
    let execute;

    if (args.all) execute = db.Daily.getAll(args.type);
    else if (args.filter) execute = db.Daily.getWithFilter(args.filter, args.type);

    execute
      .then((data) =>
        data.forEach((v) => {
          console.log(v.orderDate);
          v.menu.forEach((m) => console.log(m.name));
        }),
      )
      .catch((error) => console.error(error));
  });

program
  .command(`${command}Add <date>`)
  .option('-t, --type <type>', '', optType)
  .option('-m, --menu <menu>', '', optMenu)
  .action((date, args) => {
    list.menu = [];

    if (!args.type) return;

    let orderDate = helper.convertNumbersToEnglish(date).replace(/[^0-9]+/g, '');
    if (date.replace(/\s+/g, '') === 'all') orderDate = 0;
    else if (orderDate > 999)
      orderDate = helper.convertDateToPersian(orderDate).format('YYYYMMDD');

    let menuList = [];
    let menuInsert = [];
    let transaction;

    db.Menu.getByName(args.menu)
      .then((data) => {
        menuList = data;
        menuInsert = args.menu.filter((n) => !menuList.map((m) => m.name).includes(n));

        return true;
      })
      .then(() => db.sequelize.transaction())
      .then((data) => (transaction = data))
      .then(() =>
        Promise.map(menuInsert, (v) => db.Menu.create({ name: v }, { transaction })),
      )
      .then((data) => data.map((v) => menuList.push({ id: v.id })))
      .then(() =>
        db.Daily.create(
          {
            orderDate,
            isPrimary: args.type,
            maxCount: 1,
            priority: 1,
            isOpen: '0',
          },
          { transaction },
        ),
      )
      .then((data) =>
        Promise.map(menuList, (v) =>
          db.sequelize.query(
            `INSERT INTO daily_menu (daily_id, menu_id, insert_date) VALUES ($1, $2, $3)`,
            {
              type: db.sequelize.QueryTypes.INSERT,
              bind: [data.id, v.id, helper.getDate()],
              transaction,
            },
          ),
        ),
      )
      .then(() => transaction.commit())
      .catch(async (error) => {
        await transaction.rollback();
        console.error(error);
      });
  });

module.exports = (cmd, defaultArgv, args) =>
  program.parse(['', __filename].concat(defaultArgv).concat([cmd].concat(args)));
