const bodyParser = require('body-parser');
const config = require('config');
/**
 * @type {{open, migrate, all, run}}
 */
const sqlite = require('sqlite');
const Excel = require('xlsx');
const Populate = require('xlsx-populate');
const express = require('express');
const Promise = require('bluebird');
/**
 * @type {{format}}
 */
const persianDate = require('persian-date');
/**
 * @property unlinkAsync
 */
const fs = Promise.promisifyAll(require('fs'));
const helper = require('./lib/helper');
const logger = require('./lib/log/winston');
/**
 *
 * @type {*[]}
 */
const command = require('./lib/command');

const PORT = config.get('server.http.port');
const SUPPORTS = config.get('custom.rocket.supports');

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
  const message = req.body.text.toLowerCase();
  if (
    Object.prototype.hasOwnProperty.call(req.body, 'message') &&
    Object.prototype.hasOwnProperty.call(req.body.message, 'file')
  ) {
    if (SUPPORTS.indexOf(req.body.user_name) === -1) return helper.sendRocketFail('no_permission', req.body.user_name);

    const fileId = req.body.message.file._id;
    const fileName = req.body.message.file.name;
    if (fileName.match(/^set_lunch_list_date.*/g)) downloadExcelLunch(req.body.user_name, fileId, fileName);
    if (fileName.match(/^set_person_list.*/g)) downloadExcelUser(req.body.user_name, fileId, fileName);

    res.setHeader('Content-Type', 'application/json');
    res.send('{"status": "success"}');
    return;
  }

  let selectDate;
  let selectList;
  const dateRequest = {
    now: new persianDate(),
    week: null,
  };
  dateRequest.now.formatPersian = false;
  dateRequest.week = dateRequest.now.subtract('days', Number(dateRequest.now.format('d')) - 1);
  dateRequest.now.formatPersian = true;
  dateRequest.week.formatPersian = true;

  const regex = command(req.body.user_name);
  const regexKeys = Object.keys(regex);
  /**
   *
   * @property help
   * @property date
   * @property getLunchList
   * @property getLunchListDate
   * @property setLunchListDate
   * @property removeLunchListDate
   * @property lunchNext
   * @property lunchNextAgain
   * @property lunchNextReset
   * @property getOrderList
   * @property getUser
   * @property setUser
   * @type {{}}
   */
  const match = {};
  for (let i = 0; i < regexKeys.length; i++) match[regexKeys[i]] = regex[regexKeys[i]].command.exec(message);

  switch (true) {
    case Boolean(match.help):
      await helper.sendRocketSuccess('help', req.body.user_name, [regex]);
      break;
    case Boolean(match.date):
      await helper.sendRocketSuccess('date', req.body.user_name, [
        dateRequest.now.format('dddd DD-MM-YYYY'),
        dateRequest.week.format('w'),
        dateRequest.now.format('YYYY'),
      ]);
      break;
    case Boolean(match.getLunchList):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      getLunchList(req.body.user_name);
      break;
    case Boolean(match.getLunchListDate):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      selectDate = match.getLunchListDate[1].replace(/[^0-9]+/g, '');

      if (selectDate < 100) getLunchListDate(selectDate, req.body.user_name);
      else getLunchListDate(helper.convertDateToPersian(selectDate).format('YYYYMMDD'), req.body.user_name);
      break;
    case Boolean(match.setLunchListDate):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      selectDate = match.setLunchListDate[1].replace(/[^0-9]+/g, '');
      selectList = match.setLunchListDate[2]
        .split(/\s(?=(?:[^"']|"[^"]*")*$)/g)
        .map((v) => (v.substr(0, 1) === '"' ? v.substr(1).slice(0, -1) : v))
        .join('|');

      if (selectDate < 100) addLunchListDate(selectDate, selectList, req.body.user_name);
      else addLunchListDate(helper.convertDateToPersian(selectDate).format('YYYYMMDD'), selectList, req.body.user_name);
      break;
    case Boolean(match.removeLunchListDate):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      selectDate = match.removeLunchListDate[1].replace(/[^0-9]+/g, '');

      if (selectDate < 100) deleteLunchListDate(selectDate, req.body.user_name);
      else deleteLunchListDate(helper.convertDateToPersian(selectDate).format('YYYYMMDD'), req.body.user_name);
      break;
    case Boolean(match.lunchNext):
      updateLunchNext(
        match.lunchNext[1],
        match.lunchNext[2],
        match.lunchNext[3],
        req.body.user_name,
        req.body.channel_id,
        req.body.message_id,
      );
      break;
    case Boolean(match.lunchNextAgain):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      againLunchNext(req.body.user_name);
      break;
    case Boolean(match.lunchNextReset):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      resetLunchNext(match.lunchNextReset[1], req.body.user_name);
      break;
    case Boolean(match.getOrderList):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      getOrderList(req.body.channel_id, req.body.user_name);
      break;
    case Boolean(match.getUser):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      getUser(req.body.user_name);
      break;
    case Boolean(match.setUser):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      setUser({ name: match.setUser[1], username: match.setUser[2] }, req.body.user_name);
      break;
  }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

function downloadExcelLunch(username, fileId, fileName) {
  const file = `./storage/temp/${fileId}_${fileName}`;
  const req = helper.downloadExcel(fileId, fileName);

  req
    .on('error', (error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'download_set_lunch_list_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    // eslint-disable-next-line
    .pipe(fs.createWriteStream(file))
    .on('close', () => {
      // eslint-disable-next-line
      const wb = Excel.readFile(file);
      const result = Excel.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const data = {
        text: [],
        param: [],
      };

      for (let i = 1; i < result.length; i++) {
        if (result[i].length < 2) continue;

        data.text.push(`(null, ?, ?, ?)`);
        const [dateList, ...selectList] = result[i];
        const selectDate = helper.convertNumbersToEnglish(dateList.toString()).replace(/[^0-9]+/g, '');

        data.param.push(selectDate < 100 ? selectDate : helper.convertDateToPersian(selectDate).format('YYYYMMDD'));
        data.param.push(selectList.join('|'));
        data.param.push(helper.getDate());
      }

      if (!data.text.length)
        return Promise.all([helper.sendRocketWarning('excel_set_lunch_list_date', username), fs.unlinkAsync(file)]);

      sqlite
        .run('BEGIN')
        .then(() => sqlite.run(`UPDATE lunch_list SET delete_date = ? WHERE delete_date = 0`, [helper.getDate()]))
        .then(() =>
          sqlite.run(
            `INSERT INTO lunch_list (id, order_date, list, insert_date) VALUES ${data.text.join(', ')}`,
            data.param,
          ),
        )
        .then(() => sqlite.run('COMMIT'))
        .then(() => fs.unlinkAsync(file))
        .then(() => helper.sendRocketSuccess('set_lunch_list_date', username))
        .catch((error) => {
          sqlite.run('ROLLBACK');

          // eslint-disable-next-line
          fs.unlinkSync(file);

          throw error;
        })
        .catch((error) =>
          helper.sendRocketFail('error', username, [
            {
              key: 'code',
              value: 'excel_set_lunch_list_date',
            },
            {
              key: 'database',
              value: error.message.toString(),
            },
          ]),
        );
    });
}

function downloadExcelUser(username, fileId, fileName) {
  const file = `./storage/temp/${fileId}_${fileName}`;
  const req = helper.downloadExcel(fileId, fileName);

  req
    .on('error', (error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'download_set_person_list',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    // eslint-disable-next-line
    .pipe(fs.createWriteStream(file))
    .on('close', () => {
      // eslint-disable-next-line
      const wb = Excel.readFile(file);
      const result = Excel.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const data = {
        text: [],
        param: [],
      };

      for (let i = 1; i < result.length; i++) {
        if (!result[i].length) continue;

        data.text.push(`(null, ?, ?, ?)`);
        data.param.push(result[i][0].toString());
        data.param.push((result[i][1] || '').toString());
        data.param.push(helper.getDate());
      }

      if (!data.text.length)
        return Promise.all([helper.sendRocketWarning('excel_set_person_list', username), fs.unlinkAsync(file)]);

      sqlite
        .run('BEGIN')
        .then(() => sqlite.run(`UPDATE person SET delete_date = ? WHERE delete_date = 0`, [helper.getDate()]))
        .then(() =>
          sqlite.run(`INSERT INTO person (id, username, name, insert_date) VALUES ${data.text.join(', ')}`, data.param),
        )
        .then(() => sqlite.run('COMMIT'))
        .then(() => fs.unlinkAsync(file))
        .then(() => helper.sendRocketSuccess('set_person_list', username))
        .catch((error) => {
          sqlite.run('ROLLBACK');

          // eslint-disable-next-line
          fs.unlinkSync(file);

          throw error;
        })
        .catch((error) =>
          helper.sendRocketFail('error', username, [
            {
              key: 'code',
              value: 'excel_set_person_list',
            },
            {
              key: 'database',
              value: error.message.toString(),
            },
          ]),
        );
    });
}

function getLunchList(username) {
  sqlite
    .all(`SELECT order_date, list FROM lunch_list WHERE delete_date = 0`)
    .then((data) => helper.sendRocketSuccess('get_lunch_list', username, [data]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'select_get_lunch_list',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function getLunchListDate(selectDate, username) {
  sqlite
    .all(`SELECT order_date, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [selectDate])
    .then((data) => helper.sendRocketSuccess('get_lunch_list', username, [data]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'select_get_lunch_list_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function addLunchListDate(selectDate, selectList, username) {
  sqlite
    .run(`INSERT INTO lunch_list (id, order_date, list, insert_date) VALUES (null, ?, ?, ?)`, [
      selectDate,
      selectList,
      helper.getDate(),
    ])
    .then(() => helper.sendRocketSuccess('set_lunch_list_date', username))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'insert_set_lunch_list_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function deleteLunchListDate(selectDate, username) {
  sqlite
    .run(`UPDATE lunch_list SET delete_date = ? WHERE order_date = ? AND delete_date = 0`, [
      helper.getDate(),
      Number(selectDate),
    ])
    .then(() => helper.sendRocketSuccess('remove_lunch_list_date', username))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'update_remove_lunch_list_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function updateLunchNext(type, oid, lunch, username, channelId, messageId) {
  let rocketMessageId;
  let rocketRoomId;

  sqlite
    .all(
      `SELECT o.lunch_list_id, o.lunch, o.rocket_message_id, o.rocket_room_id, p.username FROM lunch_order o, person p WHERE o.person_id = p.id AND o.id = ? AND o.delete_date = 0`,
      [oid],
    )
    .then((data) => {
      /**
       * @property lunch_list_id
       * @property lunch
       * @property rocket_message_id
       * @property rocket_room_id
       * @property username
       */
      if (!data.length) return helper.sendRocketFail('lunch_next', username);
      else if (data.length && data[0].username !== username) return helper.sendRocketFail('no_permission', username);
      else if (data.length && data[0].lunch) return helper.sendRocketWarning('lunch_next', username);

      rocketMessageId = data[0].rocket_message_id;
      rocketRoomId = data[0].rocket_room_id;

      return sqlite.all(`SELECT list FROM lunch_list WHERE id = ? AND delete_date = 0`, [data[0].lunch_list_id]);
    })
    .then((data) => {
      if (!data) return;
      else if (!data.length) return helper.sendRocketFail('lunch_next', username);
      else if (type !== 'no' && data[0].list.split(/\|/g).indexOf(lunch) === -1)
        return helper.sendRocketFail('lunch_next_list', username);

      return sqlite.run(`UPDATE lunch_order SET lunch = ? WHERE id = ? AND lunch ISNULL`, [lunch, oid]);
    })
    .then((data) => {
      if (!data) return;

      helper.deleteLunchRequest(rocketRoomId, rocketMessageId);

      return true;
    })
    .then(
      (data) =>
        data ? helper.sendRocketSuccess('lunch_next', username, [lunch, oid, helper.nextDateInfo(true)]) : null,
    )
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'update_lunch_next',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .then(() => helper.sendRocketDelete(channelId, messageId, false))
    .catch((error) => logger.error(error.message.toString()));
}

function againLunchNext(username) {
  const [endHour, endMinute] = config.get('custom.order.end').split(':');

  const now = new persianDate();
  const end = new persianDate();

  end.hours(Number(endHour));
  end.minutes(Number(endMinute));

  now.formatPersian = false;
  end.formatPersian = false;

  // if (end.unix() - now.unix() < 0) return helper.sendRocketWarning('lunch_next_again_process', username);

  const insertDate = Number(helper.getDate().substr(0, 8));
  const orderInfo = [];
  let start = false;

  sqlite
    .all(
      `SELECT o.id, o.person_id, p.username, o.lunch_list_id, l.list FROM lunch_order o, person p, lunch_list l WHERE o.person_id = p.id AND o.lunch_list_id = l.id AND o.insert_date / 1000000000 = ? AND o.lunch ISNULL AND o.delete_date = 0`,
      [insertDate],
    )
    .then((data) => {
      if (!data.length) return helper.sendRocketWarning('lunch_next_again', username);

      // orderInfo = data;
      for (let i = 0; i < data.length; i++)
        orderInfo.push({
          id: data[i].id,
          person: { id: data[i].person_id, username: data[i].username },
          list: [{ id: data[i].lunch_list_id, list: data[i].list }],
        });

      start = true;

      return sqlite.run('BEGIN');
    })
    .then(() => orderInfo.map((v) => sendNewLunchAgain(v.id, v.person, v.list)))
    .then(() => (start ? sqlite.run('COMMIT') : null))
    .then(() => (start ? helper.sendRocketSuccess('lunch_next_again', username, [orderInfo.length]) : null))
    .catch((error) => {
      if (!start) return;

      return Promise.all([
        sqlite.run('ROLLBACK'),
        helper.sendRocketFail('error', username, [
          {
            key: 'code',
            value: 'reset_lunch_next',
          },
          {
            key: 'database',
            value: error.message.toString(),
          },
        ]),
      ]);
    })
    .catch((error) => logger.error(error.message.toString()));

  function sendNewLunchAgain(oid, person, list) {
    return sqlite
      .run(`UPDATE lunch_order SET delete_date = ? WHERE id = ?`, [helper.getDate(), oid])
      .then(() => helper.sendLunchRequest(sqlite, person, list, []))
      .then((data) => {
        if (!data) return;

        setTimeout(() => {
          helper.deleteLunchRequest(data.message.rid, data.message._id);
        }, 5 * 60 * 1000);

        return true;
      });
  }
}

function resetLunchNext(oid, username) {
  let start = false;
  const info = {};

  sqlite
    .all(
      `SELECT o.person_id, p.username, o.lunch_list_id, l.list FROM lunch_order o, person p, lunch_list l WHERE o.person_id = p.id AND o.lunch_list_id = l.id AND o.id = ? AND o.delete_date = 0`,
      [oid],
    )
    .then((data) => {
      if (!data.length) return helper.sendRocketFail('lunch_next', username);

      /**
       * @property person_id
       * @type {{id: *, username: string}}
       */
      info.person = { id: data[0].person_id, username: data[0].username };
      info.list = [];
      info.list.push({ id: data[0].lunch_list_id, list: data[0].list });
      start = true;

      return sqlite.run('BEGIN');
    })
    .then(
      () => (start ? sqlite.run(`UPDATE lunch_order SET delete_date = ? WHERE id = ?`, [helper.getDate(), oid]) : null),
    )
    .then(() => (start ? helper.sendLunchRequest(sqlite, info.person, info.list, []) : null))
    .then(() => (start ? sqlite.run('COMMIT') : null))
    .then(() => (start ? helper.sendRocketSuccess('lunch_next_reset', username, [oid]) : null))
    .catch((error) => {
      if (!start) return;

      return Promise.all([
        sqlite.run('ROLLBACK'),
        helper.sendRocketFail('error', username, [
          {
            key: 'code',
            value: 'reset_lunch_next',
          },
          {
            key: 'database',
            value: error.message.toString(),
          },
        ]),
      ]);
    })
    .catch((error) => logger.error(error.message.toString()));
}

function getOrderList(roomId, username) {
  const insertDate = Number(helper.getDate().substr(0, 8));
  const pickDate = new persianDate().format('DD-MM-YYYY');
  const output = `./storage/temp/سفارشات ${pickDate}.xlsx`;

  Promise.all([
    sqlite.all(
      `SELECT p.username, p.name, l.order_date, l.list, o.lunch FROM lunch_order o, person p, lunch_list l WHERE o.person_id = p.id AND o.lunch_list_id = l.id AND o.insert_date / 1000000000 = ? AND o.delete_date = 0`,
      [insertDate],
    ),
    Populate.fromFileAsync(config.get('custom.excelTemplate.orderList.fa')),
  ])
    .then(([data, workbook]) => {
      const sheet = workbook.sheet('Sheet1');

      if (data.length) {
        const orderDate = data[0].order_date;
        switch (orderDate) {
          case 10:
            sheet.cell('C4').value(`هفته فرد (شنبه)`);
            break;
          case 11:
            sheet.cell('C4').value(`هفته فرد (یکشنبه)`);
            break;
          case 12:
            sheet.cell('C4').value(`هفته فرد (دوشنبه)`);
            break;
          case 13:
            sheet.cell('C4').value(`هفته فرد (سه‌شنبه)`);
            break;
          case 14:
            sheet.cell('C4').value(`هفته فرد (چهارشنبه)`);
            break;
          case 20:
            sheet.cell('C4').value(`هفته زوج (شنبه)`);
            break;
          case 21:
            sheet.cell('C4').value(`هفته زوج (یکشنبه)`);
            break;
          case 22:
            sheet.cell('C4').value(`هفته زوج (دوشنبه)`);
            break;
          case 23:
            sheet.cell('C4').value(`هفته زوج (سه‌شنبه)`);
            break;
          case 24:
            sheet.cell('C4').value(`هفته زوج (چهارشنبه)`);
            break;
          default:
            sheet.cell('C4').value(new persianDate(helper.convertDateToPersian(orderDate)).format('dddd DD-MM-YYYY'));
        }

        /**
         *
         * @type {Array}
         */
        let noneRocketUser;
        try {
          // eslint-disable-next-line
          noneRocketUser = require('./build/none-rocket-user.json');

          for (let i = 0; i < noneRocketUser.length; i++) {
            noneRocketUser[i].username = '';
            noneRocketUser[i].lunch = null;
          }
        } catch (e) {
          noneRocketUser = [];
        }

        const personLunch = noneRocketUser.concat(data);

        let lunchList = [];
        for (let i = 0; i < personLunch.length; i++) {
          if (!personLunch[i].lunch) continue;
          if (lunchList.indexOf(personLunch[i].lunch) === -1) lunchList.push(personLunch[i].lunch);
        }
        lunchList = lunchList.sort().reverse();

        sheet
          .cell(`I8`)
          .value(0)
          .formula(`=COUNTA(D4:D${personLunch.length})`);
        sheet
          .cell(`I10`)
          .value(0)
          .formula(`=COUNTIF(D4:D${personLunch.length},"")`);

        let countIndex = 1;
        let tablePos = 4;
        for (let i = 0; i < personLunch.length; i++) {
          if (personLunch[i].lunch) continue;
          // const posLunch = lunchList.indexOf(personLunch[i].lunch);

          sheet.cell(`A${tablePos}`).value(countIndex++);
          sheet.cell(`B${tablePos}`).value(personLunch[i].username);
          sheet.cell(`C${tablePos}`).value(personLunch[i].name);
          // sheet.cell(`D${tablePos}`).value(personLunch[i].lunch ? posLunch : '');
          sheet.cell(`D${tablePos}`).value('');
          sheet.range(`A${tablePos}:D${tablePos}`).style({ fontSize: 12 });

          sheet.range(`A${tablePos}:C${tablePos}`).style('fill', 'bf0000');

          tablePos++;
        }

        for (let i = 0; i < lunchList.length; i++)
          for (let j = 0; j < personLunch.length; j++) {
            if (lunchList[i] !== personLunch[j].lunch) continue;

            sheet.cell(`A${tablePos}`).value(countIndex++);
            sheet.cell(`B${tablePos}`).value(personLunch[j].username);
            sheet.cell(`C${tablePos}`).value(personLunch[j].name);
            sheet.cell(`D${tablePos}`).value(i);
            sheet.range(`A${tablePos}:D${tablePos}`).style({ fontSize: 12 });

            tablePos++;
          }

        let listPost = 16;
        sheet.range(`G${listPost}:H${listPost + lunchList.length * 2 - 1}`).merged(true);

        for (let i = 0; i < lunchList.length; i++) {
          sheet.range(`I${listPost}:I${listPost + 1}`).merged(true);
          sheet
            .cell(`I${listPost}`)
            .value(i)
            .style({
              horizontalAlignment: 'center',
              verticalAlignment: 'center',
            });

          sheet.range(`J${listPost}:J${listPost + 1}`).merged(true);
          sheet
            .cell(`J${listPost}`)
            .value(lunchList[i])
            .style({
              horizontalAlignment: 'center',
              verticalAlignment: 'center',
            });

          sheet.range(`K${listPost}:K${listPost + 1}`).merged(true);
          sheet
            .cell(`K${listPost}`)
            .value(0)
            .style({
              horizontalAlignment: 'center',
              verticalAlignment: 'center',
            })
            .formula(`=COUNTIF(D4:D500,"${i}")`);

          listPost += 2;
        }
      }

      return workbook.toFileAsync(output);
    })
    /**
     * @property rid
     */
    .then(() => helper.uploadFile(output, roomId, [pickDate]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'get_order_list',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .delay(60000)
    .then(() => fs.unlinkAsync(output))
    .catch((error) => logger.error(error.message.toString()));
}

function getUser(username) {
  sqlite
    .all(`SELECT id, username, name FROM person WHERE delete_date = 0`)
    .then((data) => helper.sendRocketSuccess('get_user', username, [data]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'get_user',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .catch((error) => logger.error(error.message.toString()));
}

function setUser(person, username) {
  let start = false;
  const param = [person.username.replace('@', '').trim(), person.name, helper.getDate()];

  helper
    .getUserInfo(person.username)
    .then(() => (start = true))
    .catch((error) => {
      const output = [];
      output.push({ key: 'code', value: 'set_user' });
      if (error.message.toString().match(/error-invalid-user/))
        output.push({ key: 'rocket-chat', value: 'error-invalid-user' });
      else output.push({ key: 'rocket-chat', value: error.message.toString() });

      return helper.sendRocketFail('error', username, output);
    })
    .then(() => (start ? sqlite.all(`INSERT INTO person (username, name, insert_date) VALUES (?, ?, ?)`, param) : null))
    .then(() => (start ? helper.sendRocketSuccess('set_user', username) : null))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'get_user',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .catch((error) => logger.error(error.message.toString()));
}

Promise.resolve()
  .then(() => sqlite.open(config.get('database.order.file'), { Promise }))
  // Update db schema to the latest version using SQL-based migrations
  .then(() => sqlite.migrate({ force: 'last', migrationsPath: './storage/database/migrations' }))
  // Finally, launch the Node.js app
  .finally(() =>
    app.listen(PORT, () => {
      require('./lib/schedule')(sqlite);
      logger.info(`Example app listening on port ${PORT}!`);
    }),
  )
  // Display error message if something went wrong
  .catch((error) => logger.error(error.message.toString()));
