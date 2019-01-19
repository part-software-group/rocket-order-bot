/**
 * Created by woods on 10/12/18.
 */

const config = require('config');

const SUPPORTS = config.get('custom.rocket.supports');
const command = [
  {
    name: 'help',
    info: '',
    secure: false,
    show: true,
  },
  {
    name: 'date',
    info: 'نمایش تاریخ و زمان سرور',
    secure: false,
    show: true,
  },
  {
    name: 'daily_menu',
    info: 'منوی روزانه',
    secure: true,
    show: true,
  },
  {
    name: 'person',
    info: 'کاربران',
    secure: true,
    show: true,
  },
  {
    name: 'accept',
    info: 'تایید سفارش',
    secure: false,
    show: true,
  },
  {
    name: 'order',
    info: 'سفارشات',
    secure: false,
    show: true,
  },
];

module.exports = function(username) {
  const regex = {};
  let j = 0;

  for (let i = 0; i < command.length; i++) {
    if (command[i].secure && SUPPORTS.indexOf(username) === -1) continue;

    const name = command[i].name.replace(/(_.)/g, (v) => v.substr(1).toUpperCase());
    const commandWithAlias = command[i].name
      .toString()
      .replace(`${command[i].name}`, `!(${command[i].name}|${j})(.*)`);

    regex[name] = {
      index: i,
      command: RegExp(commandWithAlias),
      info: command[i].info,
      sample: `!${command[i].name}`,
      show: command[i].show,
      short: command[i].short,
    };
    j++;
  }

  return regex;
};
