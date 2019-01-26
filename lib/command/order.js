/**
 * Created by woods on 1/19/19.
 */

const path = require('path');
const config = require('config');
const program = require('commander');
const Promise = require('bluebird');
/**
 * @type {{format}}
 */
const persianDate = require('persian-date');
const Populate = require('xlsx-populate');
const helper = require('../helper');
const db = require('../../models/index');

const command = path.basename(__filename, '.js');

function optType(str) {
  if (str.match(/^(primary|p)$/i)) return '1';
  else if (str.match(/^(secondary|s)$/i)) return '0';
  return '';
}

program.option('-u, --user <user>');
program.option('--room-id <roomId>');
program.option('--message-id <messageId>');

program
  .command(`${command}Excel`)
  /**
   * @param {String} oid
   * @param {Object} args
   */
  .action((args) => {
    const pickDate = new persianDate().format('DD-MM-YYYY');
    const output = `./storage/temp/سفارشات ${pickDate}.xlsx`;
    const menuList = [];
    const orderList = [];
    let workbook;

    Promise.all([
      db.PersonOrder.getDailyAnalysis(),
      Populate.fromFileAsync(config.get('custom.excelTemplate.orderList.fa')),
    ])
      .then(([personOrder, workbookData]) => {
        workbook = workbookData;

        if (personOrder.length !== 0)
          Object.keys(JSON.parse(personOrder[0].menuList)).map((v) =>
            menuList.push({ id: Number(v), name: null }),
          );

        for (let i = 0; i < personOrder.length; i++) {
          orderList.push({ name: personOrder[i].person.name, menu: [] });

          for (let j = 0; j < personOrder[i].personOrderMenu.length; j++)
            orderList[i].menu.push(personOrder[i].personOrderMenu[j].menu.dataValues);
        }

        return true;
      })
      .then(() => db.Menu.getByIdlist(menuList.map((v) => v.id)))
      .then((data) => createExcel(workbook, output, menuList, orderList, data))
      .then(() => helper.uploadFile(output, args.parent.roomId, [pickDate]))
      .catch((error) => console.error(error));
  });

program
  .command(`${command}Pick <oid>`)
  .option('-m, --menu-id <mid>')
  .option('-c, --count <count>')
  /**
   * @param {String} oid
   * @param {Object} args
   */
  .action((oid, args) => {
    let change = false;

    if (args.count < 1)
      return helper.sendRocketWarning('min_count_accept_pick', args.parent.user);

    Promise.all([
      db.Menu.getWithId(args.menuId),
      db.PersonOrder.getWithId(oid),
      db.PersonOrderMenu.getCountOrderMenu(oid, args.menuId),
    ])
      .then(([menuData, personOrderData, personOrderMenuCount]) => {
        if (!(menuData && personOrderData))
          return helper.sendRocketWarning('accept_not_found', args.parent.user);

        const menuList = JSON.parse(personOrderData.menuList);
        if (!menuList[args.menuId])
          return helper.sendRocketWarning('accept_not_found_menu', args.parent.user);

        if (menuList[args.menuId].maxCount < personOrderMenuCount + Number(args.count))
          return helper.sendRocketWarning('max_count_accept_pick', args.parent.user, [
            menuData.name,
          ]);

        const rocketMessageId = JSON.parse(personOrderData.rocketMessageId);
        if (rocketMessageId.result)
          helper.deleteLunchRequest(personOrderData.rocketRoomId, rocketMessageId.result);

        if (menuList[args.menuId].isPrimary === '1')
          deleteOrderMessage(oid, {
            parent: args.parent,
            type: '1',
          });

        change = true;
        const createList = [];
        for (let i = 0; i < Number(args.count); i++)
          createList.push({
            personOrderId: oid,
            menuId: args.menuId,
          });

        return db.PersonOrderMenu.bulkCreate(createList);
      })
      .then(() => showResult(oid, change, args))
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
  .command(`${command}Finish <oid>`)
  .option('-t, --type <type>', '', optType)
  .action((oid, args) => {
    if (!args.type) return helper.sendRocketWarning(args._name, args.parent.user);

    db.PersonOrder.getWithId(oid)
      .then((data) => {
        if (!data) return helper.sendRocketWarning('accept_not_found', args.parent.user);

        const rocketMessageId = JSON.parse(data.rocketMessageId);
        if (rocketMessageId.result)
          helper.deleteLunchRequest(data.rocketRoomId, rocketMessageId.result);

        deleteOrderMessage(oid, args);

        return showResult(oid, true, args);
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

program.command(`${command}Reset <oid>`).action((oid, args) => {
  const { weekDay, date } = helper.nextDateInfo();
  let orderInfo;
  let transaction;

  db.PersonOrder.getWithId(oid)
    .then((data) => (orderInfo = data))
    .then(() => db.sequelize.transaction())
    .then((data) => (transaction = data))
    .then(() =>
      Promise.all([
        db.PersonOrder.resetWithOid(oid, transaction),
        db.PersonOrderMenu.resetWithOid(oid, transaction),
      ]),
    )
    .then(() => {
      transaction.commit();
      transaction = null;

      return true;
    })
    .then(() =>
      Promise.all([
        db.Person.getWithId(orderInfo.personId),
        db.Daily.getDailyMenuList('1', 0, date, weekDay),
        db.Daily.getDailyMenuList('0', 0, date, weekDay),
      ]),
    )
    .then(([person, pm, sm]) => helper.sendLunchRequest(db, person, pm, sm))
    .catch(async (error) => {
      if (transaction) await transaction.rollback();
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

function createExcel(workbook, output, menuList, orderList, data) {
  for (let i = 0; i < menuList.length; i++)
    for (let j = 0; j < data.length; j++)
      if (menuList[i].id === data[j].id) {
        menuList[i].name = data[j].name;
        break;
      }

  const sheet = {
    menu: workbook.sheet('Menu'),
    order: workbook.sheet('Order'),
  };

  let menuPos = 5;
  let menuCol = 68;
  let countIndex = 1;
  let tablePos = 3;

  sheet.menu.cell('K5').value(new persianDate().format('YYYY-MM-DD dddd'));

  for (let i = 0; i < menuList.length; i++) {
    const col = String.fromCharCode(menuCol);
    menuList[i].col = col;

    sheet.menu.range(`B${menuPos}:D${menuPos + 1}`).merged(true);
    sheet.menu
      .cell(`B${menuPos}`)
      .value(menuList[i].name)
      .style({
        horizontalAlignment: 'center',
        verticalAlignment: 'center',
      });

    sheet.menu.range(`E${menuPos}:E${menuPos + 1}`).merged(true);
    sheet.menu.cell(`E${menuPos}`).style({
      horizontalAlignment: 'center',
      verticalAlignment: 'center',
    });
    // .formula(`=SUM($order.${col}:$order.${col})`);

    sheet.order.range(`${col}1:${col}2`).merged(true);
    sheet.order.column(col).width(menuList[i].name.length * 1.5);
    sheet.order
      .cell(`${col}1`)
      .value(menuList[i].name)
      .style({
        horizontalAlignment: 'center',
        verticalAlignment: 'center',
      })
      .style('fill', '2a6099');

    menuPos += 2;
    menuCol++;
  }

  /**
   * Remove unnecessary formula
   */
  for (let i = menuPos; i < 50; i++) sheet.menu.cell(`E${i}`).value(null);

  /**
   * First add user without order
   */
  for (let i = 0; i < orderList.length; i++) {
    if (orderList[i].menu.length > 0) continue;

    sheet.order
      .cell(`A${tablePos}`)
      .style({
        horizontalAlignment: 'center',
        verticalAlignment: 'center',
      })
      .value(countIndex++);
    sheet.order
      .cell(`B${tablePos}`)
      .style({
        horizontalAlignment: 'center',
        verticalAlignment: 'center',
      })
      .value(orderList[i].name);

    for (let j = 0; j < menuList[i].length; j++)
      sheet.order
        .cell(`${menuList[i].col}${tablePos}`)
        .style({
          horizontalAlignment: 'center',
          verticalAlignment: 'center',
        })
        .value(0);

    tablePos++;
  }

  /**
   * Second add user with order
   */
  for (let i = 0; i < orderList.length; i++) {
    if (orderList[i].menu.length === 0) continue;

    sheet.order
      .cell(`A${tablePos}`)
      .style({
        horizontalAlignment: 'center',
        verticalAlignment: 'center',
      })
      .value(countIndex++);
    sheet.order
      .cell(`B${tablePos}`)
      .style({
        horizontalAlignment: 'center',
        verticalAlignment: 'center',
      })
      .value(orderList[i].name);

    for (let j = 0; j < orderList[i].menu.length; j++) {
      const menuInfo = menuList.filter((v) => v.id === orderList[i].menu[j].id)[0];
      sheet.order
        .cell(`${menuInfo.col}${tablePos}`)
        .style({
          horizontalAlignment: 'center',
          verticalAlignment: 'center',
        })
        .value(orderList[i].menu[j].count);
    }

    tablePos++;
  }

  return workbook.toFileAsync(output);
}

async function showResult(oid, change, args) {
  if (!change) return false;

  return db.PersonOrderMenu.getGroupCountByOrderId(oid)
    .then((data) => {
      const { property } = helper.nextDateInfo();
      property.formatPersian = true;

      return helper.sentResultRequest(
        args.parent.user,
        property.format('DD-MM-YYYY'),
        oid,
        data,
      );
    })
    .then((data) =>
      db.PersonOrder.updateRocketMessageId(oid, { result: data.message._id }),
    );
}

function deleteOrderMessage(oid, args) {
  db.PersonOrder.getWithId(oid)
    .then((data) => {
      let update = false;
      const rocketMessageId = JSON.parse(data.rocketMessageId);

      switch (args.type) {
        case '1':
          if (rocketMessageId.primary) {
            helper.deleteLunchRequest(data.rocketRoomId, rocketMessageId.primary);
            delete rocketMessageId.primary;
            update = true;
          }
          break;
        case '0':
          if (rocketMessageId.secondary) {
            helper.deleteLunchRequest(data.rocketRoomId, rocketMessageId.secondary);
            delete rocketMessageId.secondary;
            update = true;
          }
          break;
      }

      if (update) {
        data.rocketMessageId = JSON.stringify(rocketMessageId);
        helper.deleteLunchRequest(args.parent.roomId, args.parent.messageId);

        return data.save();
      }

      return true;
    })
    .catch((error) => console.log(error));
}

module.exports = (cmd, defaultArgv, args) =>
  program.parse(['', __filename].concat(defaultArgv).concat([cmd].concat(args)));
