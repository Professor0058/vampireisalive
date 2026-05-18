const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST } = require('discord.js');

// ✅ ENV
const TOKEN = process.env.TOKEN?.trim();
const CLIENT_ID = process.env.CLIENT_ID?.trim();
const OWNER_ID = process.env.OWNER_ID?.trim();
const SECOND_OWNER_ID = process.env.SECOND_OWNER_ID?.trim();

const OWNERS = [OWNER_ID, SECOND_OWNER_ID].filter(Boolean);
console.log("✅ Loaded Owners:", OWNERS);

const prefix = ",";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let lockedUsers = new Map();


// 🔥 IPL FUNCTION (CRASH PROOF)
async function fetchIplRates() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return "❌ Missing ODDS_API_KEY!";

  try {
    const url = `https://api.the-odds-api.com/v4/sports/cricket_ipl/odds/?apiKey=${apiKey}&regions=in&markets=h2h&oddsFormat=decimal`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data || !Array.isArray(data) || data.length === 0) {
      return "⚠️ No IPL matches from API (try later)";
    }

    const match = data.find(m => m.home_team && m.away_team);

    if (!match) {
      return "⚠️ Match data incomplete";
    }

    const home = match.home_team;
    const away = match.away_team;

    let text = `🏏 ${home} vs ${away}\n`;

    const bookmaker = match.bookmakers?.[0];
    const market = bookmaker?.markets?.find(m => m.key === "h2h");
    const outcomes = market?.outcomes;

    if (!outcomes || outcomes.length < 2) {
      return text + "⚠️ Odds not available yet";
    }

    text += `🔥 Odds:\n`;
    text += `${home}: ${outcomes[0].price}x\n`;
    text += `${away}: ${outcomes[1].price}x`;

    return text;

  } catch (err) {
    return "❌ API Error: " + err.message;
  }
}


// ✅ SLASH COMMANDS
const commands = [
    new SlashCommandBuilder()
        .setName('professoractive')
        .setDescription('Lock a user and control messages')
        .addUserOption(option =>
            option.setName('target').setDescription('User').setRequired(true))
        .addStringOption(option =>
            option.setName('text').setDescription('Text').setRequired(true)),

    new SlashCommandBuilder()
        .setName('removelock')
        .setDescription('Unlock user')
        .addUserOption(option =>
            option.setName('target').setDescription('User').setRequired(true)),

    new SlashCommandBuilder()
        .setName('lebeta')
        .setDescription('Send message as user')
        .addUserOption(option =>
            option.setName('target').setDescription('User').setRequired(true))
        .addStringOption(option =>
            option.setName('text').setDescription('Text').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ipl')
        .setDescription('Get IPL odds')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);


// ✅ REGISTER COMMANDS
(async () => {
    try {
        console.log("🔄 Registering commands...");
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log("✅ Commands registered");
    } catch (err) {
        console.error(err);
    }
})();


// ✅ READY
client.on('ready', () => {
    console.log(`🧛 Online as ${client.user.tag}`);
});


// ✅ WEBHOOK
async function getWebhook(channel) {
    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find(h => h.name === "Vampire");

    if (!hook) hook = await channel.createWebhook({ name: "Vampire" });

    return hook;
}


// 🔥 AUTO DELETE
function autoDelete(msg) {
    setTimeout(() => msg.delete().catch(() => {}), 2500);
}


// ✅ PREFIX SYSTEM
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // 🔥 LOCK SYSTEM
    if (lockedUsers.has(message.author.id)) {
        await message.delete();
        const webhook = await getWebhook(message.channel);
        const text = lockedUsers.get(message.author.id);
        const member = message.guild.members.cache.get(message.author.id);

        return webhook.send({
            content: text,
            username: member ? member.displayName : message.author.username,
            avatarURL: message.author.displayAvatarURL({ dynamic: true })
        });
    }

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (!OWNERS.includes(message.author.id)) {
        return message.reply("❌ Only owners 😈").then(autoDelete);
    }

    // lock
    if (cmd === "lock") {
        const user = message.mentions.users.first();
        const text = args.slice(1).join(" ");

        if (!user || !text) return message.reply("Usage: ,lock @user msg").then(autoDelete);

        lockedUsers.set(user.id, text);
        const member = message.guild.members.cache.get(user.id);

        message.reply(`🧛 ${member ? member.displayName : user.username} locked`)
            .then(autoDelete);
    }

    // unlock
    if (cmd === "unlock") {
        const user = message.mentions.users.first();
        if (!user) return message.reply("Usage: ,unlock @user").then(autoDelete);

        lockedUsers.delete(user.id);
        const member = message.guild.members.cache.get(user.id);

        message.reply(`🧛 ${member ? member.displayName : user.username} unlocked`)
            .then(autoDelete);
    }

    // lebeta
    if (cmd === "lebeta") {
        const user = message.mentions.users.first();
        const text = args.slice(1).join(" ");

        if (!user || !text) return message.reply("Usage: ,lebeta @user msg").then(autoDelete);

        const member = message.guild.members.cache.get(user.id);
        const webhook = await getWebhook(message.channel);

        await webhook.send({
            content: text,
            username: member ? member.displayName : user.username,
            avatarURL: user.displayAvatarURL({ dynamic: true })
        });

        message.reply(`🧛 Sent as ${member ? member.displayName : user.username}`)
            .then(autoDelete);
    }

    // IPL PREFIX
    if (cmd === "ipl") {
        const msg = await message.reply("🔄 Fetching IPL...");
        const data = await fetchIplRates();
        msg.edit(data);
    }
});


// ✅ SLASH COMMANDS
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (!OWNERS.includes(interaction.user.id)) {
        return interaction.reply({ content: "❌ Only owners 😈", ephemeral: true });
    }

    const user = interaction.options.getUser('target');
    const member = user ? interaction.guild.members.cache.get(user.id) : null;

    if (interaction.commandName === 'professoractive') {
        const text = interaction.options.getString('text');
        lockedUsers.set(user.id, text);

        await interaction.reply(`🧛 ${member ? member.displayName : user.username} locked`);
    }

    if (interaction.commandName === 'removelock') {
        lockedUsers.delete(user.id);

        await interaction.reply(`🧛 ${member ? member.displayName : user.username} unlocked`);
    }

    if (interaction.commandName === 'lebeta') {
        const text = interaction.options.getString('text');
        const webhook = await getWebhook(interaction.channel);

        await webhook.send({
            content: text,
            username: member ? member.displayName : user.username,
            avatarURL: user.displayAvatarURL({ dynamic: true })
        });

        await interaction.reply({ content: "✅ Sent", ephemeral: true });
    }

    if (interaction.commandName === 'ipl') {
        await interaction.deferReply();
        const data = await fetchIplRates();
        await interaction.editReply(data);
    }
});


// ✅ LOGIN
client.login(TOKEN);
