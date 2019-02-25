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

// program.option('-u, --user <user>');
// program.option('--room-id <roomId>');
// program.option('--message-id <messageId>');
program.command(command).description('اطلاعات مربوط به افزودن یا تغییر منوی روزانه');

program
  .command(`${command}Get`)
  .description('دریافت لیست غذاها در منوی روزانه')
  .option('-a, --all', 'دریافت تمام لیست')
  .option('-t, --type <type>', 'نوع منوی روزانه', optType)
  .option('-f, --filter [date]', 'محدود کردن بر اساس تاریخ انتخابی', optFilter)
  .allowUnknownOption(true)
  .action((args) => {
    list.filter = [];
    let execute;

    if (Object.hasOwnProperty.call(args, 'type')) execute = db.Daily.getAll(args.type);
    else if (Object.hasOwnProperty.call(args, 'filter'))
      execute = db.Daily.getWithFilter(args.filter, args.type);
    else execute = db.Daily.getAll();

    execute
      .then((data) => {
        const menuList = [];
        data.forEach((v) => {
          menuList.push({
            orderDate: v.orderDate,
            list: v.menu.map((o) => o.name).join('|'),
          });
        });

        return helper.sendRocketSuccess(args._name, args.parent.user, [menuList]);
      })
      .catch((error) =>
        helper.sendRocketFail('error', args.parent.user, [
          {
            key: 'code',
            value: args._name,
          },
          {
            key: 'message',
            value: error.message.toString(),
          },
        ]),
      );
  });

program
  .command(`${command}Add <date>`)
  .description('افزودن غذا به منوی روزانه')
  .option('-t, --type <type>', 'نوع منوی روزانه', optType)
  .option('-m, --menu [menu]', 'لیست غذا‌ها', optMenu)
  .option('-o, --is-open', 'وضعیت باز یا بسته بودم منو برای اتصال به منو‌های بعدی')
  .allowUnknownOption(true)
  .action((date, args) => {
    list.menu = [];

    if (!args.type) return helper.sendRocketWarning(args._name, args.parent.user);

    let orderDate = helper.convertNumbersToEnglish(date).replace(/[^0-9]+/g, '');
    if (date.replace(/\s+/g, '') === 'all') orderDate = 0;
    else if (orderDate > 999)
      orderDate = helper.convertDateToPersian(orderDate).format('YYYYMMDD');

    const isOpen = Object.hasOwnProperty.call(args, 'isOpen') ? '1' : '0';
    delete args.isOpen;

    let menuList = [];
    let menuInsert = [];
    let transaction;

    const menuData = {
      name: [],
      count: [],
    };
    for (let i = 0; i < args.menu.length; i++) {
      const [name, countStr = '1'] = args.menu[i].split(':');
      const count = Number(countStr);
      menuData.name.push(name);
      menuData.count.push(!isNaN(count) && count > 0 ? count : 1);
    }

    db.Menu.getByName(menuData.name)
      .then((data) => {
        menuList = data;
        menuInsert = menuData.name.filter(
          (n) => !menuList.map((m) => m.name).includes(n),
        );

        return true;
      })
      .then(() => db.sequelize.transaction())
      .then((data) => (transaction = data))
      .then(() =>
        Promise.map(menuInsert, (v) =>
          db.Menu.create({ name: v, insertDate: helper.getDate() }, { transaction }),
        ),
      )
      .then((data) => data.map((v) => menuList.push({ id: v.id, name: v.name })))
      .then(() =>
        db.Daily.create(
          {
            orderDate,
            isPrimary: args.type,
            priority: 1,
            isOpen,
            insertDate: helper.getDate(),
          },
          { transaction },
        ),
      )
      .then((data) =>
        Promise.map(menuList, (v) =>
          db.sequelize.query(
            `INSERT INTO daily_menu (daily_id, menu_id, max_count, insert_date) VALUES ($1, $2, $3, $4)`,
            {
              type: db.sequelize.QueryTypes.INSERT,
              bind: [
                data.id,
                v.id,
                menuData.count[menuData.name.indexOf(v.name)],
                helper.getDate(),
              ],
              transaction,
            },
          ),
        ),
      )
      .then(() => transaction.commit())
      .then(() => helper.sendRocketSuccess(args._name, args.parent.user))
      .catch(async (error) => {
        await transaction.rollback();
        await helper.sendRocketFail('error', args.parent.user, [
          {
            key: 'code',
            value: args._name,
          },
          {
            key: 'message',
            value: error.message.toString(),
          },
        ]);
      });
  });
