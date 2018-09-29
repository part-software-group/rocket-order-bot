/**
 * Created by pooya on 9/27/18.
 */

const fs = require('fs');
const config = require('config');
const Request = require('request-promise');
const uuid = require('uuid/v4');
/**
 * @type {{format}}
 */
const persianDate = require('persian-date');
const logger = require('./log/winston');
// eslint-disable-next-line
const rocketChatAuth = require('../build/rocket-chat-auth');

function getDate() {
  const datePick = new Date();
  const year = datePick.getFullYear();
  const month = (datePick.getMonth() + 1).toString().padStart(2, '0');
  const day = datePick
    .getDate()
    .toString()
    .padStart(2, '0');
  const hours = datePick
    .getHours()
    .toString()
    .padStart(2, '0');
  const minutes = datePick
    .getMinutes()
    .toString()
    .padStart(2, '0');
  const seconds = datePick
    .getSeconds()
    .toString()
    .padStart(2, '0');
  const milliseconds = datePick
    .getMilliseconds()
    .toString()
    .padEnd(3, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
}

function convertDateToPersian(date) {
  const selectDate = Number(date);
  const dateFormat = date.toString().replace(/([0-9]{4})([0-9]{2})([0-9]{2})/, '$1-$2-$3');
  let change;

  if (selectDate > 20000000) change = new persianDate(new Date(dateFormat));
  else change = new persianDate(dateFormat.split(/-/g).map((v) => Number(v)));

  change.formatPersian = false;

  return change;
}

function convertNumbersToEnglish(string) {
  return string
    .replace(/[\u0660-\u0669]/g, (c) => c.charCodeAt(0) - 0x0660)
    .replace(/[\u06f0-\u06f9]/g, (c) => c.charCodeAt(0) - 0x06f0);
}

function sendLunchRequest(sqlite, person, listWeek, listToday) {
  const body = {
    channel: `@${person.username}`,
    msg: `سفارش برای تاریخ *${new persianDate()
      .add('day', 1)
      .format('dddd DD-MM-YYYY')}* \n\nلطفا غذا فردای خود را با کلیک برروی نام غذا انتخاب کنید`,
    attachments: [
      {
        text: '*لیست غذاها:*',
        actions: [],
      },
    ],
  };

  if (!listToday.length && !listWeek.length) return;

  const oid = uuid();
  const listRow = listToday.length ? listToday[0] : listWeek[0];
  const list = listRow.list.split(/\|/g);
  for (let i = 0; i < list.length; i++)
    body.attachments[0].actions.push({
      type: 'button',
      text: list[i],
      msg: `!lunch_tomorrow pick ${oid} ${list[i]}`,
      // eslint-disable-next-line
      msg_in_chat_window: true,
    });

  if (config.get('custom.order.cancel'))
    body.attachments[0].actions.push({
      type: 'button',
      text: 'غذا میل ندارم!',
      msg: `!lunch_tomorrow no ${oid} -`,
      // eslint-disable-next-line
      msg_in_chat_window: true,
    });

  return Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
    body,
    json: true,
  })
    .then((data) => {
      // noinspection JSUnresolvedVariable
      sqlite.run(
        `INSERT INTO lunch_order (id, person_id, lunch_list_id, rocket_message_id, rocket_room_id, insert_date) VALUES (?, ?, ?, ?, ?, ?)`,
        [oid, person.id, listRow.id, data.message._id, data.message.rid, getDate()],
      );

      return data;
    })
    .catch((error) => logger.error(`Can't send lunch request! ${error.message.toString()}`));
}

function deleteLunchRequest(roomId, msgId) {
  Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.delete`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
    body: {
      roomId,
      msgId,
      asUser: true,
    },
    json: true,
  }).catch((error) => logger.error(error.message.toString()));
}

function downloadExcel(fileId, fileName) {
  return Request({
    method: 'get',
    url: `${config.get('custom.rocket.url')}/file-upload/${fileId}/${fileName}`,
    headers: {
      Cookie: `rc_uid=${rocketChatAuth.userId}; rc_token=${rocketChatAuth.authToken}`,
    },
  });
}

async function uploadFile(filename, roomId, args) {
  await Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/rooms.upload/${roomId}`,
    headers: {
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
      'Content-Type': `multipart/form-data; boundary=----WebKitFormBoundary${uuid()}`,
    },
    formData: {
      file: {
        // eslint-disable-next-line
        value: fs.createReadStream(filename),
        options: {
          filename,
          contentType: null,
        },
      },
      description: `لیست سفارشات مورخ ${args[0]}`,
    },
    json: true,
  });
}

async function sendRocketDelete(roomId, msgId, asUser) {
  await Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.delete`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
    body: {
      roomId,
      msgId,
      asUser: asUser || false,
    },
    json: true,
  });
}

/**
 *
 * @param command
 * @param user
 * @param {Array} args
 * @param {Number} [args[][].order_date]
 * @return {Promise<void>}
 */
async function sendRocketSuccess(command, user, args) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  body.emoji = ':white_check_mark:';
  switch (command) {
    case 'date':
      delete body.emoji;
      body.msg = new persianDate().format('امروز dddd DD-MM-YYYY، هفته w از سال YYYY');
      break;
    case 'set_lunch_list_date':
      body.msg = 'سفارش ناهار به درستی ثبت گردید';
      break;
    case 'remove_lunch_list_date':
      body.msg = 'سفارش ناهار به درستی حذف گردید';
      break;
    case 'get_lunch_list':
      delete body.emoji;
      body.msg = 'لیست ناهار:';
      body.attachments = [];
      for (let i = 0; i < args[0].length; i++) {
        body.attachments.push({
          color: 'green',
          text: `تاریخ *${args[0][i].order_date}*`,
          fields: [],
        });
        switch (args[0][i].order_date) {
          case 10:
            body.attachments[i].text = `هفته فرد *شنبه*`;
            break;
          case 11:
            body.attachments[i].text = `هفته فرد *یکشنبه*`;
            break;
          case 12:
            body.attachments[i].text = `هفته فرد *دوشنبه*`;
            break;
          case 13:
            body.attachments[i].text = `هفته فرد *سه‌شنبه*`;
            break;
          case 14:
            body.attachments[i].text = `هفته فرد *چهارشنبه*`;
            break;
          case 20:
            body.attachments[i].text = `هفته زوج *شنبه*`;
            break;
          case 21:
            body.attachments[i].text = `هفته زوج *یکشنبه*`;
            break;
          case 22:
            body.attachments[i].text = `هفته زوج *دوشنبه*`;
            break;
          case 23:
            body.attachments[i].text = `هفته زوج *سه‌شنبه*`;
            break;
          case 24:
            body.attachments[i].text = `هفته زوج *چهارشنبه*`;
            break;
          default:
            body.attachments[i].text = `تاریخ *${args[0][i].order_date}*`;
        }
        args[0][i].list.split(/\|/g).map((v) => body.attachments[i].fields.push({ value: v, short: true }));
      }
      break;
    case 'set_person_list':
      body.msg = 'کاربر به درستی ثبت گردید';
      break;
    case 'lunch_tomorrow':
      body.msg = `سفارش شما برای فردا (${new persianDate().add('day', 1).format('dddd DD-MM-YYYY')}) ثبت شد.\n\n`;
      body.attachments = [
        {
          color: 'green',
          title: `تاییدیه سفارش`,
          fields: [
            {
              title: 'شماره پیگیری',
              value: args[1],
              short: true,
            },
            {
              title: 'غذا انتخابی',
              value: args[0],
              short: true,
            },
            {
              title: 'تاریخ ثبت',
              value: new persianDate().format('HH:mm YYYY-MM-DD'),
              short: true,
            },
          ],
        },
        {
          color: 'yellow',
          text: 'درصورتی که می‌خواهید انتخاب خود را تغییر دهید به پشتیبانی مراجعه کنید.',
        },
      ];
      break;
  }

  try {
    return await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': rocketChatAuth.userId,
        'X-Auth-Token': rocketChatAuth.authToken,
      },
      body,
      json: true,
    });
  } catch (error) {
    logger.error(error.message.toString());
  }
}

async function sendRocketWarning(command, user, args) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  body.emoji = ':warning:';
  switch (command) {
    case 'excel_set_lunch_list_date':
    case 'excel_set_person_list':
      body.msg = 'هیچ داده‌ای در اکسل برای افزودن وجود ندارد!';
      break;
    case 'lunch_tomorrow':
      body.msg = 'شما قبلا غذا ثبت کرده‌اید! لطفا برای ثبت مجدد با پشتبیانی در تماس باشد.';
      break;
  }

  if (args && args.length) {
    body.attachments = [];
    body.attachments.push({
      color: 'yellow',
      fields: [],
    });

    for (let i = 0; i < args.length; i++)
      body.attachments[0].fields.push({
        short: false,
        title: args[i].key,
        value: args[i].value,
      });
  }

  try {
    await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': rocketChatAuth.userId,
        'X-Auth-Token': rocketChatAuth.authToken,
      },
      body,
      json: true,
    });
  } catch (error) {
    logger.error(error.message.toString());
  }
}

async function sendRocketFail(command, user, args) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  body.emoji = ':negative_squared_cross_mark:';
  switch (command) {
    case 'set_lunch_list_date':
      body.msg = 'خطا در افزودن سفارش ناهار!';
      break;
    case 'lunch_tomorrow':
      body.msg = 'چنین سفارشی وجود ندارد!';
      break;
    case 'lunch_tomorrow_list':
      body.msg = 'غذای انتخابی در سفارش موجود نیست!';
      break;
    case 'no_permission':
      body.msg = 'شما اجازه استفاده از این دستور را ندارید!';
      break;
    case 'error':
      body.msg = 'خطا در اجرا کد!';
      break;
  }

  if (args && args.length) {
    body.attachments = [];
    body.attachments.push({
      color: 'red',
      fields: [],
    });

    for (let i = 0; i < args.length; i++)
      body.attachments[0].fields.push({
        short: false,
        title: args[i].key,
        value: args[i].value,
      });
  }

  try {
    await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': rocketChatAuth.userId,
        'X-Auth-Token': rocketChatAuth.authToken,
      },
      body,
      json: true,
    });
  } catch (error) {
    logger.error(error.message.toString());
  }
}

module.exports = {
  getDate,
  convertDateToPersian,
  convertNumbersToEnglish,
  sendLunchRequest,
  downloadExcel,
  uploadFile,
  deleteLunchRequest,
  sendRocketDelete,
  sendRocketSuccess,
  sendRocketWarning,
  sendRocketFail,
};
