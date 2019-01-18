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
  .option('-d, --daily-id <did>')
  .option('-m, --menu-id <mid>')
  .option('-c, --count <count>')
  /**
   * @param {String} oid
   * @param {Object} args
   */
  .action((oid, args) => {
    console.log(oid);
    console.log(args.dailyId);
    console.log(args.menuId);
    console.log(args.count);

    Promise.all([
      db.Daily.getWithId(args.dailyId),
      db.Menu.getWithId(args.menuId),
      db.PersonOrderMenu.getCountOrderMenu(oid, args.menuId),
    ])
      .then(([dailyData, menuData, personOrderMenuCount]) => {
        if (dailyData.maxCount <= personOrderMenuCount)
          return helper.sendRocketWarning('max_count_accept_pick', args.parent.user, [
            menuData.name,
          ]);

        if (dailyData.isPrimary === '1') {
          deleteOrderMessage(oid, {
            parent: args.parent,
            type: '1',
          });

          return db.PersonOrderMenu.create({
            personOrderId: oid,
            menuId: args.menuId,
          });
        } else if (dailyData.isPrimary === '0')
          return db.PersonOrderMenu.create({
            personOrderId: oid,
            menuId: args.menuId,
          });

        return true;
      })
      .catch((error) => console.log(error));
  });

program
  .command(`${command}Finish <oid>`)
  .option('-t, --type <type>', '', optType)
  .action(function(oid, args) {
    if (!args.type) return;

    deleteOrderMessage(oid, args);
  });

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
