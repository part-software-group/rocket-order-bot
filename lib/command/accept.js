/**
 * Created by woods on 1/18/19.
 */

const path = require('path');
const program = require('commander');
const Promise = require('bluebird');
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
  .command(`${command}Pick <oid>`)
  .option('-m, --menu-id <mid>')
  .option('-c, --count <count>')
  /**
   * @param {String} oid
   * @param {Object} args
   */
  .action((oid, args) => {
    let change = false;
    console.log(oid);
    console.log(args.menuId);
    console.log(args.count);

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
      .catch((error) => console.log(error));
  });

program
  .command(`${command}Finish <oid>`)
  .option('-t, --type <type>', '', optType)
  .action(function(oid, args) {
    if (!args.type) return;

    db.PersonOrder.getWithId(oid)
      .then((data) => {
        if (!data) return helper.sendRocketWarning('accept_not_found', args.parent.user);

        const rocketMessageId = JSON.parse(data.rocketMessageId);
        if (rocketMessageId.result)
          helper.deleteLunchRequest(data.rocketRoomId, rocketMessageId.result);

        deleteOrderMessage(oid, args);

        return showResult(oid, true, args);
      })
      .catch((error) => console.log(error));
  });

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
