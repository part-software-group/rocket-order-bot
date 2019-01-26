/**
 * Created by woods on 1/17/19.
 */

const path = require('path');
const helper = require('../helper');
const program = require('commander');
const db = require('../../models/index');

const command = path.basename(__filename, '.js');

program.option('-u, --user <user>');

program
  .command(`${command}Add <username> <name>`)
  .option('-R, --exclude-rocket-chat')
  /**
   * @param {String} username
   * @param {String} name
   * @param {Object} args
   * @param {Boolean} args.excludeRocketChat
   */
  .action((username, name, args) => {
    if (username.substr(0, 1) !== '@')
      return helper.sendRocketWarning(args._name, args.parent.user);

    const obj = {
      username: username.substr(1),
      name,
      platform: args.excludeRocketChat ? null : 'rocket-chat',
    };

    db.Person.create(obj)
      .then(() => helper.sendRocketSuccess(args._name, args.parent.user))
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

program.command(`${command}Get [username...]`).action(function(username, args) {
  let execute;

  if (username.length > 0) execute = db.Person.getWithUsername(username);
  else execute = db.Person.getAll();

  execute
    .then((data) => helper.sendRocketSuccess(args._name, args.parent.user, [data]))
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

program.command(`${command}Rm [username...]`).action(function(username, args) {
  db.Person.rm(username)
    .then((data) => {
      if (data[0] === 0) return helper.sendRocketWarning(args._name, args.parent.user);

      return helper.sendRocketSuccess(args._name, args.parent.user);
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

module.exports = (cmd, defaultArgv, args) =>
  program.parse(['', __filename].concat(defaultArgv).concat([cmd].concat(args)));
