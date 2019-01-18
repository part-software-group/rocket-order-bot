/**
 * Created by woods on 1/17/19.
 */

const path = require('path');
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
    const obj = {
      username,
      name,
      platform: args.excludeRocketChat ? null : 'rocket-chat',
    };

    db.Person.create(obj)
      .then((user) => console.log(user.get({ plain: true }).id))
      .catch((error) => console.error(error));
  });

program.command(`${command}Get [username...]`).action(function(username) {
  let execute;

  if (username.length > 0) execute = db.Person.getWithUsername(username);
  else execute = db.Person.findAll();

  execute
    .then((data) => data.forEach((v) => console.log(v.name)))
    .catch((error) => console.error(error));
});

program.command(`${command}Rm [username...]`).action(function(username) {
  db.Person.rm(username)
    .then(() => console.log('success'))
    .catch((error) => console.error(error));
});

module.exports = (cmd, defaultArgv, args) =>
  program.parse(['', __filename].concat(defaultArgv).concat([cmd].concat(args)));
