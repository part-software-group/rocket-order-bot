/**
 * Created by pooya on 9/27/18.
 */

const fs = require('fs');
const config = require('config');
const Promise = require('bluebird');
const Request = require('request-promise');
const uuid = require('uuid/v4');
/**
 * @type {{format}}
 */
const persianDate = require('persian-date');
const logger = require('./log/winston');
// eslint-disable-next-line
const rocketChatAuth = require('../build/rocket-chat-auth');
/**
 * @type {Array}
 */
const holiday = require('../storage/private/holiday');

const startDayOfYear = new persianDate().month(1).date(1);
startDayOfYear.formatPersian = false;

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

function nextDateInfo() {
  const days = config.get('custom.order.days');
  let date = new persianDate().startOf('day');
  let available = true;

  date.formatPersian = false;

  let name = date
    .toLocale('en')
    .format('dddd')
    .substr(0, 3)
    .toLowerCase();
  if (days.indexOf(name) === -1) available = false;

  date.toLocale('fa');
  date.formatPersian = false;

  if (holiday.indexOf(Number(date.format('YYYYMMDD'))) !== -1) available = false;

  nextDay();

  function nextDay() {
    date = date.add('days', 1);

    name = date
      .toLocale('en')
      .format('dddd')
      .substr(0, 3)
      .toLowerCase();

    // noinspection JSUnresolvedFunction
    date.toLocale('fa');
    date.formatPersian = false;

    if (days.indexOf(name) === -1) return nextDay();
    if (holiday.indexOf(Number(date.format('YYYYMMDD'))) !== -1) return nextDay();
  }

  const weekOfYear =
    startDayOfYear.day() - date.day() < 1
      ? Number(date.format('w')) - 1
      : Number(date.format('w'));
  const week = weekOfYear % 2 === 0 ? 2 : 1;

  const now = new persianDate();
  now.formatPersian = false;
  date
    .hour(now.hour())
    .minute(now.minutes())
    .second(now.seconds());

  return {
    available,
    weekDay: `${week}${date.days() - 1}`,
    date: date.format('YYYYMMDD'),
    property: date,
  };
}

function convertDateToPersian(date) {
  const selectDate = Number(date);
  const dateFormat = date
    .toString()
    .replace(/([0-9]{4})([0-9]{2})([0-9]{2})/, '$1-$2-$3');
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

async function sentResultRequest(user, date, oid, menuData) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  body.emoji = ':white_check_mark:';
  body.msg = `سفارش شما برای تاریخ ${date} ثبت شد.\n\n`;

  const menuField = [];
  for (let i = 0; i < menuData.length; i++) {
    const name = menuData[i].menu.dataValues.name;
    const count = menuData[i].menu.dataValues.count;

    if (i !== 0 && i % 3 === 0)
      menuField.push({
        value: ``,
        short: false,
      });

    menuField.push({
      title: name,
      value: `> ${count} :تعداد`,
      short: true,
    });
  }

  const selectList = {};
  if (menuField.length === 0) {
    selectList.color = 'yellow';
    selectList.text = 'متاسفانه شما غذایی انتخاب نکرده‌اید!';
  } else {
    selectList.color = 'green';
    selectList.title = 'لیست انتخابی';
    selectList.fields = menuField;
  }

  body.attachments = [
    {
      color: 'green',
      title: `تاییدیه سفارش`,
      fields: [
        {
          title: 'شماره پیگیری',
          value: `> ${oid}`,
          short: true,
        },
        {
          title: 'تاریخ ثبت',
          value: `> ${new persianDate().format('HH:mm YYYY-MM-DD')}`,
          short: true,
        },
      ],
    },
    selectList,
    {
      color: 'yellow',
      text: 'درصورتی که می‌خواهید سفارش خود را تغییر دهید به پشتیبانی مراجعه کنید.',
    },
  ];

  return await Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/chat.postMessage`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
    body,
    json: true,
  });
}

function sendLunchRequest(db, person, primaryMenu, secondaryMenu, change = false) {
  const oid = uuid();
  const { property } = nextDateInfo();
  property.formatPersian = true;

  const menuCount = { primary: 0, secondary: 0 };
  const menuList = {};
  const primaryBody = {
    channel: `@${person.username}`,
    msg: `سفارش ${change ? 'مجدد' : ''} برای تاریخ *${property.format(
      'dddd DD-MM-YYYY',
    )}*`,
    attachments: [
      {
        text: '*منوی اصلی*',
        actions: [],
      },
    ],
  };
  const secondaryBody = {
    channel: `@${person.username}`,
    msg: `سفارش ${change ? 'مجدد' : ''} برای تاریخ *${property.format(
      'dddd DD-MM-YYYY',
    )}*`,
    attachments: [
      {
        text: '*منوی مخلفات*',
        actions: [],
      },
    ],
  };

  const primaryData = { id: null, isOpen: false };
  for (let i = 0; i < primaryMenu.length; i++) {
    if (!primaryData.id) {
      primaryData.id = primaryMenu[i].id;
      primaryData.isOpen = primaryMenu[i].isOpen === '1';
    }

    if (primaryData.id !== primaryMenu[i].id && !primaryData.isOpen) continue;
    else if (primaryData.id !== primaryMenu[i].id && primaryData.isOpen) {
      primaryData.id = primaryMenu[i].id;
      primaryData.isOpen = primaryMenu[i].isOpen === '1';
    }

    for (let j = 0; j < primaryMenu[i].menu.length; j++) {
      const menuId = primaryMenu[i].menu[j].id;
      menuList[menuId] = {
        isPrimary: '1',
        maxCount: primaryMenu[i].menu[j].DailyMenu.maxCount,
      };
      primaryBody.attachments[0].actions.push({
        type: 'button',
        text: primaryMenu[i].menu[j].name,
        msg: `!order pick ${oid} -m ${menuId} -c 1`,
        // eslint-disable-next-line
        msg_in_chat_window: true,
      });
      menuCount.primary++;
    }
  }

  if (config.get('custom.order.cancel'))
    primaryBody.attachments[0].actions.push({
      type: 'button',
      text: 'غذا میل ندارم!',
      msg: `!order finish ${oid} -t p`,
      // eslint-disable-next-line
      msg_in_chat_window: true,
    });

  const secondaryData = { id: null, isOpen: false };
  for (let i = 0; i < secondaryMenu.length; i++) {
    if (!secondaryData.id) {
      secondaryData.id = secondaryMenu[i].id;
      secondaryData.isOpen = secondaryMenu[i].isOpen === '1';
    }

    if (secondaryData.id !== secondaryMenu[i].id && !primaryData.isOpen) continue;
    else if (secondaryData.id !== secondaryMenu[i].id && primaryData.isOpen) {
      secondaryData.id = secondaryMenu[i].id;
      secondaryData.isOpen = secondaryMenu[i].isOpen === '1';
    }

    for (let j = 0; j < secondaryMenu[i].menu.length; j++)
      for (let k = 0; k < secondaryMenu[i].menu[j].DailyMenu.maxCount; k++) {
        const menuId = secondaryMenu[i].menu[j].id;
        menuList[menuId] = {
          isPrimary: '0',
          maxCount: secondaryMenu[i].menu[j].DailyMenu.maxCount,
        };
        secondaryBody.attachments[0].actions.push({
          type: 'button',
          text: `${secondaryMenu[i].menu[j].name} (تعداد: +${k + 1})`,
          msg: `!order pick ${oid} -m ${menuId} -c ${k + 1}`,
          // eslint-disable-next-line
          msg_in_chat_window: true,
        });
        menuCount.secondary++;
      }
  }

  secondaryBody.attachments[0].actions.push({
    type: 'button',
    text: 'اتمام انتخاب',
    msg: `!order finish ${oid} -t s`,
    // eslint-disable-next-line
    msg_in_chat_window: true,
  });

  const rocket = {
    roomId: null,
    messageId: {
      primary: null,
      secondary: null,
    },
  };
  const sendRequests = [];

  sendRequests.push(menuCount.primary > 0 ? primaryBody : null);
  sendRequests.push(menuCount.secondary > 0 ? secondaryBody : null);

  db.PersonOrder.checkIdempotent(person.id)
    .then((count) => {
      if (count > 0) throw new Error('break');

      return true;
    })
    .then(() =>
      Promise.mapSeries(sendRequests, (body) => {
        if (person.platform !== 'rocket-chat' || !body)
          return { message: { _id: null, rid: null } };

        return Request({
          method: 'post',
          url: `${config.get('custom.rocket.url')}${config.get(
            'custom.rocket.api',
          )}/chat.postMessage`,
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': rocketChatAuth.userId,
            'X-Auth-Token': rocketChatAuth.authToken,
          },
          body,
          json: true,
        });
      }),
    )
    .then(([rocketPrimaryBody, rocketSecondaryBody]) => {
      rocket.roomId = rocketPrimaryBody.message.rid || rocketSecondaryBody.message.rid;
      rocket.messageId.primary = rocketPrimaryBody.message._id;
      rocket.messageId.secondary = rocketSecondaryBody.message._id;

      return true;
    })
    .then(() =>
      db.PersonOrder.create({
        id: oid,
        personId: person.id,
        rocketMessageId: JSON.stringify(rocket.messageId),
        rocketRoomId: rocket.roomId,
        menuList: JSON.stringify(menuList),
        insertDate: getDate(),
      }),
    )
    .catch((error) => {
      if (error.message.toString() === 'break') return;

      logger.error(`Can't send lunch request! ${error.message.toString()}`);

      if (rocket.roomId) {
        deleteLunchRequest(rocket.roomId, rocket.messageId.primary);
        deleteLunchRequest(rocket.roomId, rocket.messageId.secondary);
      }
    });
}

function deleteLunchRequest(roomId, msgId) {
  Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/chat.delete`,
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
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/rooms.upload/${roomId}`,
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
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/chat.delete`,
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
    case 'help': {
      delete body.emoji;
      body.attachments = [];

      for (let i = 0; i < args.length; i++) {
        body.attachments.push({
          color: 'green',
          text: `> ${args[i].name}`,
          fields: [],
          actions: [],
        });

        const j = body.attachments.length - 1;

        if (Object.hasOwnProperty.call(args[i], 'index')) {
          body.attachments[j].fields.push({
            title: 'Description',
            value: `\`\`\`${args[i].description}\`\`\``,
            short: false,
          });
          body.attachments[j].fields.push({
            title: 'Command',
            value: `\`\`\`!${args[i].name}\`\`\``,
            short: true,
          });
          body.attachments[j].fields.push({
            title: 'Alias command',
            value: `\`\`\`!${args[i].index}\`\`\``,
            short: true,
          });
        } else {
          body.attachments[j].fields.push({
            title: 'Command',
            value: `\`\`\`!${args[i].name}\`\`\``,
            short: true,
          });
          body.attachments[j].fields.push({
            title: 'Description',
            value: `\`\`\`${args[i].description}\`\`\``,
            short: true,
          });
        }

        if (args[i].hasHelp)
          body.attachments[j].actions.push({
            type: 'button',
            text: `لیست دستورات`,
            msg: `!${args[i].name} --help`,
            // eslint-disable-next-line
            msg_in_chat_window: true,
          });

        body.attachments.push({ text: '\r\n\r\n' });
      }
      break;
    }
    case 'helpCommand': {
      delete body.emoji;
      body.msg = `\`\`\`bash\r\n${args[0]}\`\`\``;
      break;
    }
    case 'date':
      delete body.emoji;
      body.msg = `امروز ${args[0]}، هفته ${args[1]} از سال ${args[2]}`;
      break;
    case 'menuAdd':
      body.msg = 'سفارش به درستی ثبت گردید';
      break;
    case 'delDailyMenuDate':
      body.msg = 'سفارش به درستی حذف گردید';
      break;
    case 'getDailyMenu':
    case 'menuGet':
      delete body.emoji;
      body.msg = 'لیست:';
      body.attachments = [];
      for (let i = 0; i < args[0].length; i++) {
        body.attachments.push({
          color: 'green',
          text: `تاریخ *${args[0][i].orderDate}*`,
          fields: [],
        });

        const j = body.attachments.length - 1;
        switch (args[0][i].orderDate) {
          case 0:
            body.attachments[j].text = `*منوی ثابت*`;
            break;
          case 10:
            body.attachments[j].text = `هفته فرد *شنبه*`;
            break;
          case 11:
            body.attachments[j].text = `هفته فرد *یکشنبه*`;
            break;
          case 12:
            body.attachments[j].text = `هفته فرد *دوشنبه*`;
            break;
          case 13:
            body.attachments[j].text = `هفته فرد *سه‌شنبه*`;
            break;
          case 14:
            body.attachments[j].text = `هفته فرد *چهارشنبه*`;
            break;
          case 20:
            body.attachments[j].text = `هفته زوج *شنبه*`;
            break;
          case 21:
            body.attachments[j].text = `هفته زوج *یکشنبه*`;
            break;
          case 22:
            body.attachments[j].text = `هفته زوج *دوشنبه*`;
            break;
          case 23:
            body.attachments[j].text = `هفته زوج *سه‌شنبه*`;
            break;
          case 24:
            body.attachments[j].text = `هفته زوج *چهارشنبه*`;
            break;
          default:
            body.attachments[j].text = `تاریخ *${args[0][i].orderDate}*`;
        }
        args[0][i].list
          .split(/\|/g)
          .map((v) => body.attachments[j].fields.push({ value: `> ${v}`, short: true }));

        body.attachments.push({ text: '\r\n\r\n' });
      }
      break;
    case 'set_person_list':
      body.msg = 'کاربر به درستی ثبت گردید';
      break;
    case 'accept_order':
      body.msg = `سفارش شما برای تاریخ ${args[2]} ثبت شد.\n\n`;
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
          text: 'درصورتی که می‌خواهید سفارش خود را تغییر دهید به پشتیبانی مراجعه کنید.',
        },
      ];
      break;
    case 'lunch_next_again':
    case 'orderResend':
      body.msg = `درخواست سفارش مجدد برای ${args[0]} کاربر ارسال شد.`;
      break;
    case 'lunch_next_reset':
      body.msg = `سفارش *${args[0]}* دوباره برای کار ارسال شد.`;
      break;
    case 'personGet':
      body.msg = `*تعداد کاربران ${args[0].length}*`;
      body.attachments = [];

      for (let i = 0; i < args[0].length; i++) {
        body.attachments.push({
          color: 'green',
          fields: [],
          actions: [],
        });

        if (args[0][i].name)
          body.attachments[i].fields.push({
            title: 'نام و نام‌خانوادگی',
            value: `${args[0][i].name}`,
            short: true,
          });

        body.attachments[i].fields.push({
          title: 'نام کاربری',
          value: `${args[0][i].username}`,
          short: true,
        });

        body.attachments[i].actions.push({
          type: 'button',
          text: `حذف کاربر`,
          msg: `!person rm ${args[0][i].id}`,
          // eslint-disable-next-line
          msg_in_chat_window: true,
        });
      }
      break;
    case 'personAdd':
      body.msg = `کاربر موردنظر به سامانه درج گردید.`;
      break;
    case 'personRm':
      body.msg = `کاربر موردنظر از سامانه حذف گردید.`;
      break;
  }

  try {
    return await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get(
        'custom.rocket.api',
      )}/chat.postMessage`,
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
    case 'delDailyMenuDate':
      body.msg = 'هیچ داده‌ای برای تاریخ انتخابی وجود ندارد!';
      break;
    case 'excel_set_lunch_list_date':
    case 'excel_set_person_list':
      body.msg = 'هیچ داده‌ای در اکسل برای افزودن وجود ندارد!';
      break;
    case 'accept_order':
      body.msg =
        'شما قبلا غذا ثبت کرده‌اید! لطفا برای ثبت مجدد با پشتبیانی در تماس باشد.';
      break;
    case 'lunch_next_again':
      body.msg = 'هیچ سفارشی برای ارسال درخواست وجود ندارد.';
      break;
    case 'lunch_next_again_process':
      body.msg = 'زمان سفارش هنوز تمام نشده است!';
      break;
    case 'personRm':
      body.msg = 'کاربر موردنظر در سامانه نیست!';
      break;
    case 'change_current_orders':
      body.msg = `با عرض پوزش غذا تغییر کرده است. لطفا دوباره غذا موردنظر خود را انتخاب کنید.`;
      break;
    case 'max_count_accept_pick':
      body.msg = `شما قبلا *${args[0]}* را انتخاب کرده‌اید!`;
      args.pop();
      break;
    case 'min_count_accept_pick':
      body.msg = `حداقل باید یک غذا از منو انتخاب کنید!`;
      break;
    case 'accept_not_found':
      body.msg = `هیچ داده‌ای برای تایید سفارش پیدا نشد!`;
      break;
    case 'accept_not_found_menu':
      body.msg = `غذای انتخابی در منو وجود ندارد!`;
      break;
    case 'personAdd':
      body.msg = `نام کاربری باید با کاراکتر @ شروع شود!`;
      break;
    case 'menuAdd':
      body.msg = `لطفا نوع غذا را مشخص کنید!`;
      break;
    case 'orderFinish':
      body.msg = `نوع غذا برای تایید نهایی یافت نشد!`;
      break;
    case 'orderReset':
      body.msg = `شماره پیگیری در سامانه وجود ندارد!`;
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
      url: `${config.get('custom.rocket.url')}${config.get(
        'custom.rocket.api',
      )}/chat.postMessage`,
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
    case 'accept_order':
      body.msg = 'چنین سفارشی وجود ندارد!';
      break;
    case 'lunch_next_list':
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
      url: `${config.get('custom.rocket.url')}${config.get(
        'custom.rocket.api',
      )}/chat.postMessage`,
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

async function getUserInfo(username) {
  return await Request({
    method: 'get',
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/users.info?username=${username}`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
  });
}

function checkOrderProcessFinish(sqlite, username, func, code) {
  sqlite
    .all(`SELECT value FROM settings where key = ?`, ['order_process_finish'])
    .then((data) => {
      if (data.length && new persianDate().unix() < Number(data[0].value))
        return sendRocketWarning('lunch_next_again_process', username, [
          {
            key: 'زمان اتمام سفارش',
            value: new persianDate.unix(Number(data[0].value)).format(
              'HH:mm:ss YYYY-MM-DD',
            ),
          },
        ]);

      func();

      return true;
    })
    .catch((error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: code,
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

async function updateOrderProcessFinish(db, finishDate) {
  const orderUnixFinish = new persianDate()
    .hour(finishDate.hour())
    .minute(finishDate.minute())
    .unix();

  return db.sequelize.query(`INSERT OR REPLACE INTO settings VALUES ($1, $2)`, {
    type: db.sequelize.QueryTypes.INSERT,
    bind: ['order_process_finish', orderUnixFinish.toString()],
  });
}

module.exports = {
  nextDateInfo,
  getDate,
  convertDateToPersian,
  convertNumbersToEnglish,
  sentResultRequest,
  sendLunchRequest,
  downloadExcel,
  uploadFile,
  deleteLunchRequest,
  sendRocketDelete,
  sendRocketSuccess,
  sendRocketWarning,
  sendRocketFail,
  getUserInfo,
  checkOrderProcessFinish,
  updateOrderProcessFinish,
};
