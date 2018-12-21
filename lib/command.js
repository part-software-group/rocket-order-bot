/**
 * Created by woods on 10/12/18.
 */

const config = require('config');

const SUPPORTS = config.get('custom.rocket.supports');
const command = [
  {
    name: 'help',
    command: /^\s*!help\r*\n*\s*$/,
    info: '',
    sample: '!help',
    secure: false,
    show: true,
  },
  {
    name: 'date',
    command: /^\s*!date\r*\n*\s*$/,
    info: 'نمایش تاریخ و زمان سرور',
    sample: '!date',
    secure: false,
    show: true,
  },
  {
    name: 'get_lunch_list',
    command: /^\s*!get_lunch_list\r*\n*\s*$/,
    info: 'نمایش لیست ناهار',
    sample: '!get_lunch_list',
    secure: true,
    show: true,
  },
  {
    name: 'get_lunch_list_date',
    command: /^\s*!get_lunch_list_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8}|[0-9]{2})$/,
    info: 'نمایش لیست ناهار یک روز خاص',
    sample: '!get_lunch_list_date <date>',
    secure: true,
    show: true,
  },
  {
    name: 'set_lunch_list_date',
    command: /^\s*!set_lunch_list_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8}|[0-9]{2})\s(.+)/,
    info: 'افزودن ناهار برای یک تاریخ خاص',
    sample: '!set_lunch_list_date <date>',
    secure: true,
    show: true,
  },
  {
    name: 'remove_lunch_list_date',
    command: /^\s*!remove_lunch_list_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8}|[0-9]{2}|all)$/,
    info: 'حذف ناهار برای یک تاریخ خاص',
    sample: '!remove_lunch_list_date <date|all>',
    secure: true,
    show: true,
  },
  {
    name: 'lunch_next',
    command: /^\s*!lunch_next\s(no|pick)\s([a-z0-9-]+)\s(.+)/,
    info: 'انتخاب ناهار روز بعد',
    sample: '!lunch_next <no|pick> <token> <lunch>',
    secure: false,
    show: false,
  },
  {
    name: 'lunch_next_again',
    command: /^\s*!lunch_next_again(\s[2-9])?\r*\n*\s*$/,
    info: 'ارسال مجدد درخواست سفارش روز بعد',
    sample: '!lunch_next_again',
    secure: true,
    show: true,
  },
  {
    name: 'lunch_next_reset',
    command: /^\s*!lunch_next_reset\s([a-z0-9-]+)\r*\n*\s*$/,
    info: 'تغییر مجدد سفارش کاربر با ارسال پیام سفارش',
    sample: '!lunch_next_reset <token>',
    secure: true,
    show: true,
  },
  {
    name: 'get_order_list',
    command: /^\s*!get_order_list\r*\n*\s*$/,
    info: 'لیست سفارشات روز جاری',
    sample: '!get_order_list',
    secure: true,
    show: true,
  },
  {
    name: 'get_user',
    command: /^\s*!get_user\r*\n*\s*$/,
    info: 'لیست کاربران سامانه',
    sample: '!get_user',
    secure: true,
    show: true,
  },
  {
    name: 'set_user',
    command: /^\s*!set_user\s"([^"]+)"\s@(.+)$/,
    info: 'افزودن کاربر به سامانه',
    sample: '!set_user "person-name" @person-username',
    secure: true,
    show: true,
  },
  {
    name: 'remove_user',
    command: /^\s*!remove_user\s([0-9-]+)\r*\n*\s*$/,
    info: 'حذف کاربر از سامانه',
    sample: '!remove_user <uid>',
    secure: true,
    show: false,
  },
];

module.exports = function(username) {
  const regex = {};

  for (let i = 0; i < command.length; i++) {
    if (command[i].secure && SUPPORTS.indexOf(username) === -1) continue;

    const name = command[i].name.replace(/(_.)/g, (v) => v.substr(1).toUpperCase());
    const commandWithAlias = command[i].command
      .toString()
      .replace(`!${command[i].name}`, `!(?:${command[i].name}|${i})`)
      .slice(1, -1);

    regex[name] = {
      index: i,
      command: RegExp(commandWithAlias),
      info: command[i].info,
      sample: command[i].sample,
      show: command[i].show,
    };
  }

  return regex;
};
