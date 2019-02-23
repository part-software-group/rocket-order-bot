/**
 * Created by woods on 2/11/19.
 */

const program = require('commander');

const helper = require('../helper');

program.option('-u, --user <user>');
program.option('--room-id <roomId>');
program.option('--message-id <messageId>');

program.command(`customHelp <name>`).action(async (name, args) => {
  let help = '';
  const [cmd, type = ''] = name.split('-');

  if (type === 'this') {
    help = program.helpInformation();
    help = help
      .replace('Usage: default [options] [command]', `Usage: !${cmd} [options] [command]`)
      .replace(/(-u, --user|--room-id|--message-id).*\r*\n*\t*\s*/g, '');
  } else
    for (let i = 0; i < program.commands.length; i++)
      if (program.commands[i]._name === cmd) {
        help = program.commands[i].helpInformation();
        help = help
          .replace(/\|[0-9]+/, '')
          .replace(
            /(Usage: .+)/,
            `$1\r\n       !${program.commands[i]._alias} [options]`,
          );
        break;
      }

  help = help
    .replace(
      /Usage: ([a-z]+)([A-Z][a-z]+)(.*)/,
      (all, a, b, c) => `Usage: !${a} ${b.toLowerCase()}${c}`,
    )
    .replace('output usage information', 'اطلاعات درباره دستور اجرایی');

  const commandHelp = /Commands:(\r?\n?\t?\s?.)*/.exec(help);
  if (Array.isArray(commandHelp))
    help = [
      help.replace(/Commands:(\r?\n?\t?\s?.)*/, 'Commands:'),
      commandHelp[0]
        .replace(/Commands:(\r\n|\n)/, '')
        .replace(RegExp(`^((?!(\\s*${cmd})).)*`, 'gm'), '')
        .replace(RegExp(`${cmd}\\s*\\t*.*\\r*\\n*\\t*\\s*`), '')
        .replace(/([a-z]+)([A-Z][a-z]+)(.*)/g, (all, a, b, c) => `${b.toLowerCase()}${c}`)
        .replace(/\W+/, '  '),
    ]
      .join('')
      .replace(/(\r\n|\n){2,}$/, '');

  help = sample(cmd, help);

  await helper.sendRocketSuccess('helpCommand', args.parent.user, [help]);
});

function sample(cmd, help) {
  let output = help;

  switch (cmd) {
    case 'menuGet':
      output +=
        '\r\n' +
        'Samples:\r\n' +
        '  # دریافت کل منو‌ها\r\n' +
        '  !menu get -a\r\n' +
        '\r\n' +
        '  # دریافت لیست منوی اصلی \r\n' +
        '  !menu get -t primary\r\n' +
        '  !menu get -t p\r\n' +
        '\r\n' +
        '  # دریافت لیست منوی مخلفات \r\n' +
        '  !menu get -t secondary\r\n' +
        '  !menu get -t s\r\n' +
        '\r\n' +
        '  # دریافت لیست منو براساس تاریخ 13971101\r\n' +
        '  !menu get -f 13971101\r\n' +
        '\r\n' +
        '  # دریافت لیست منو براساس شنبه‌های زوج\r\n' +
        '  !menu get -f 20\r\n' +
        '\r\n' +
        '  # دریافت لیست منو براساس تمام روزها\r\n' +
        '  !menu get -f 0\r\n';
      break;
    case 'menuAdd':
      output +=
        '\r\n' +
        'Samples:\r\n' +
        '  # افزودن غذا به لیست منوی اصلی برای تاریخ 13971111\r\n' +
        '  !menu add 13971111 -t primary -m مرغ -m "جوجه کباب"\r\n' +
        '  !menu add 13971111 -t p -m مرغ -m "جوجه کباب"\r\n' +
        '\r\n' +
        '  # افزودن غذا به لیست منوی مخلفات برای تاریخ 13971111، تعداد هر غذا برابر است با ۱ \r\n' +
        '  !menu add 13971111 -t secondary -m نوشابه:1 -m "سوپ جو:1" -m ماست:1\r\n' +
        '  !menu add 13971111 -t s -m نوشابه:1 -m "سوپ جو:1" -m ماست:1\r\n' +
        '\r\n' +
        '  # افزودن غذا به لیست منوی مخلفات برای تاریخ 13971111، تعداد هر غذا متغیر است \r\n' +
        '  !menu add 13971111 -t secondary -m نوشابه:2 -m "سوپ جو:1" -m ماست:3\r\n' +
        '  !menu add 13971111 -t s -m نوشابه:2 -m "سوپ جو:1" -m ماست:3\r\n';
      break;
    case 'personAdd':
      output +=
        '\r\n' +
        'Samples:\r\n' +
        '  # افزودن کاربر\r\n' +
        '  !person add @Your.Username your-name\r\n' +
        '  !person add @Your.Username "your name"\r\n' +
        '\r\n' +
        '  # افزودن کاربری که در راکت‌چت نیست \r\n' +
        '  !person add -R @Your.Username your-name\r\n' +
        '  !person add -R @Your.Username "your name"\r\n';
      break;
  }

  return output;
}

module.exports = (cmd, defaultArgv, args) =>
  program.parse(
    ['', __filename]
      .concat(defaultArgv)
      .concat([cmd])
      .concat(args),
  );
