const bodyParser = require('body-parser');
const config = require('config');
/**
 * @type {{open, migrate, all, run}}
 */
const sqlite = require('sqlite');
const express = require('express');
const Promise = require('bluebird');
/**
 * @type {{format}}
 * @property unix
 */
const persianDate = require('persian-date');
const helper = require('./lib/helper');
const logger = require('./lib/log/winston');
const execute = require('./lib/execute');
const program = require('commander');
const commands = {
  default: require('./lib/command/default'),
  menu: require('./lib/command/menu'),
  order: require('./lib/command/order'),
  person: require('./lib/command/person'),
};

const PORT = config.get('server.http.port');
const SUPPORTS = config.get('custom.rocket.supports');
const SECURE = config.get('custom.commandSecure');

/**
 * @property use
 * @property get
 * @property post
 */
const app = express();
app.use(bodyParser.json());

app.post('/hook/rocket', async (req, res) => {
  /**
   * @property _id
   * @property channel_id
   * @property message_id
   * @property user_name
   */
  const message = req.body.text;
  if (
    Object.prototype.hasOwnProperty.call(req.body, 'message') &&
    Object.prototype.hasOwnProperty.call(req.body.message, 'file')
  ) {
    if (SUPPORTS.indexOf(req.body.user_name) === -1)
      return helper.sendRocketFail('no_permission', req.body.user_name);

    const fileId = req.body.message.file._id;
    const fileName = req.body.message.file.name;
    if (fileName.match(/^set_lunch_list_date.*/g))
      execute.downloadExcelLunch(sqlite, req.body.user_name, fileId, fileName);
    if (fileName.match(/^set_person_list.*/g))
      execute.downloadExcelUser(sqlite, req.body.user_name, fileId, fileName);

    res.setHeader('Content-Type', 'application/json');
    res.send('{"status": "success"}');
    return;
  }

  const dateRequest = {
    now: new persianDate(),
    week: null,
  };
  dateRequest.now.formatPersian = false;
  dateRequest.week = dateRequest.now.subtract(
    'days',
    Number(dateRequest.now.format('d')) - 1,
  );
  dateRequest.now.formatPersian = true;
  dateRequest.week.formatPersian = true;

  console.log(message);
  if (message.substr(0, 1) !== '!') {
    res.setHeader('Content-Type', 'application/json');
    res.send('{"status": "success"}');

    return;
  }

  const commandKeys = Object.keys(commands);
  let programAlias = 2;
  for (let i = 0; i < program.commands.length; i++) {
    if (
      SUPPORTS.indexOf(req.body.user_name) === -1 &&
      SECURE.indexOf(program.commands[i]._name) !== -1
    )
      continue;
    else if (program.commands[i]._name.match(/Help$/)) continue;

    if (commandKeys.indexOf(program.commands[i]._name) === -1)
      program.commands[i].alias(programAlias++);
  }

  switch (true) {
    case Boolean(message.match(/^!(0|help)\r*\n*\s*$/)): {
      const helps = [];
      let aliasNum = 0;

      helps.push({
        name: `help`,
        description: `لیست دستورات`,
        sample: `!help`,
        index: aliasNum++,
      });
      helps.push({
        name: `date`,
        description: `نمایش تاریخ و زمان سرور`,
        sample: `!date`,
        index: aliasNum++,
      });

      for (let i = 0; i < program.commands.length; i++) {
        if (
          SUPPORTS.indexOf(req.body.user_name) === -1 &&
          SECURE.indexOf(program.commands[i]._name) !== -1
        )
          continue;
        else if (program.commands[i]._name.match(/Help$/)) continue;

        if (commandKeys.indexOf(program.commands[i]._name) !== -1)
          helps.push({
            name: program.commands[i]._name,
            description: program.commands[i]._description,
            sample: ``,
            hasHelp: true,
          });
      }
      await helper.sendRocketSuccess('help', req.body.user_name, helps);
      break;
    }
    case Boolean(message.match(/^!(1|date)\r*\n*\s*$/)):
      await helper.sendRocketSuccess('date', req.body.user_name, [
        dateRequest.now.format('dddd DD-MM-YYYY'),
        dateRequest.week.format('w'),
        dateRequest.now.format('YYYY'),
      ]);
      break;
    default: {
      const match = { name: '', args: '', alias: false };
      const aliasMatch = /^!([0-9]+)\s*(.*)/.exec(message);
      if (Array.isArray(aliasMatch)) {
        for (let i = 0; i < program.commands.length; i++)
          if (program.commands[i]._alias === Number(aliasMatch[1])) {
            match.name = program.commands[i]._name;
            match.args = aliasMatch[2];
            match.alias = true;
            break;
          }
      } else {
        const cmdMatch = /^!([a-zA-Z]+)\s+(.*)/.exec(message);
        if (!Array.isArray(cmdMatch)) break;
        if (!Object.hasOwnProperty.call(commands, cmdMatch[1])) break;
        if (cmdMatch[1] === 'default') break;

        match.name = cmdMatch[1];
        match.args = cmdMatch[2];
      }

      if (!match.name) break;

      findCommand(req.body, match.name, match.args, match.alias);
    }
  }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

function findCommand(body, name, args, isAlias) {
  const list = args
    .split(/\s(?=(?:[^"']|"[^"]*")*$)/g)
    .map((v) => (v.substr(0, 1) === '"' ? v.substr(1).slice(0, -1) : v))
    .filter((v) => v !== '');

  const defaultArgv = [
    '-u',
    body.user_name,
    '--room-id',
    body.channel_id,
    '--message-id',
    body.message_id,
  ];
  const list0 = list[0] || '';
  const list1 = list[1] || '';
  let argv = [];
  let cmd;

  if (list0.match(/^(--help|-h)/)) {
    cmd = `customHelp`;
    argv.push(!isAlias ? `${name}-this` : name);
  } else if (list0.match(/[^-]+/) && list1.match(/^(--help|-h)/)) {
    cmd = `customHelp`;
    argv.push(`${name}${capitalize(list0)}`);
  } else if (isAlias) {
    cmd = name;
    argv = list;
  } else {
    cmd = `${name}${capitalize(list0)}`;
    argv = list.splice(1);
  }

  if (SUPPORTS.indexOf(body.user_name) === -1 && SECURE.indexOf(cmd) !== -1)
    return helper.sendRocketFail('no_permission', body.user_name);

  commands.default(cmd, defaultArgv, argv);
}

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

Promise.resolve()
  .then(() => sqlite.open(config.get('database.order.file'), { Promise }))
  // Update db schema to the latest version using SQL-based migrations
  .then(() => sqlite.migrate({ migrationsPath: './storage/database/migrations' }))
  // Launch the Node.js app
  .then(() =>
    app.listen(PORT, () => {
      sqlite.close();
      // require('./lib/schedule')(sqlite);
      logger.info(`Example app listening on port ${PORT}!`);
    }),
  )
  // Display error message if something went wrong
  .catch((error) => logger.error(error.message.toString()));
