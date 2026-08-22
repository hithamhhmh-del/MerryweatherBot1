const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    REST,
    Routes,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- 1. إدارة ملفات البيانات ---
const DB_FILE = './duty_data.json';

function loadData() {
    if (!fs.existsSync(DB_FILE)) {
        return { activeSessions: {}, snoozeSessions: {}, userDutyStats: {}, reportLogs: [], userStats: {}, lastReportTime: {} };
    }
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!data.reportLogs) data.reportLogs = [];
        if (!data.userStats) data.userStats = {};
        if (!data.lastReportTime) data.lastReportTime = {};
        if (!data.activeSessions) data.activeSessions = {};
        if (!data.snoozeSessions) data.snoozeSessions = {};
        if (!data.userDutyStats) data.userDutyStats = {};
        return data;
    } catch {
        return { activeSessions: {}, snoozeSessions: {}, userDutyStats: {}, reportLogs: [], userStats: {}, lastReportTime: {} };
    }
}

function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const db = loadData();

// === الإعدادات والآيديات ===
const TOKEN = process.env.DISCORD_TOKEN || 'MTUzMTQ4MTExMDQyMzI3NzY2OQ.GPnPrQ.FrkcPnH9BxjSRCxlownAksy-VA_5zN60MZN6iM';
const CLIENT_ID = '1531481110423277669';
const GUILD_ID = '1504137101225099415';

// قائمة الآيديات المستثناة من منافسة "عضو الأسبوع"
const EXCLUDED_USERS = [
    '964757645590409236',
    '716349760641957980',
    '678937684500152346',
    '1068520107611017216'
];

// --- آيدي روم لوق الحضور ---
const ATTENDANCE_LOG_CHANNEL = '1531839834291834891';

// --- آيديات رومات التقارير ---
const RECON_PENDING_CHANNEL = '1533417338777374842';
const PROTECT_PENDING_CHANNEL = '1533417411938750656';
const SUPPLY_PENDING_CHANNEL = '1533417481291563119';

const MOD_ROLE_ID = '1504137101401260141';

function hasModRole(member) {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(MOD_ROLE_ID);
}

function initUserDuty(userId) {
    if (!db.userDutyStats[userId]) {
        db.userDutyStats[userId] = { totalMs: 0 };
    }
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h - ${minutes}m - ${seconds}s`;
}

async function sendToLogChannel(guild, embed) {
    const logChannel = guild.channels.cache.get(ATTENDANCE_LOG_CHANNEL);
    if (logChannel) {
        await logChannel.send({ embeds: [embed] }).catch(console.error);
    }
}

// === تسجيل أوامر السلاش ===
const commands = [
    new SlashCommandBuilder().setName('دفتر_الحضور').setDescription('إرسال لوحة دفتر تسجيل الحضور والغياب'),
    new SlashCommandBuilder().setName('لوحة_التحكم').setDescription('إرسال لوحة التحكم والإشراف العام'),
    new SlashCommandBuilder().setName('جرد_الساعات').setDescription('استخراج تقرير جرد ساعات الحضور لجميع الأعضاء'),
    new SlashCommandBuilder().setName('نظام_التقارير').setDescription('إرسال لوحة تقديم التقارير المخصصة حسب الفئة'),
    new SlashCommandBuilder()
        .setName('فحص_العضو')
        .setDescription('الاستعلام عن ساعات وحالة عضو محدد')
        .addUserOption(option => option.setName('العضو').setDescription('حدد العضو المراد فحصه').setRequired(true)),
    new SlashCommandBuilder().setName('عضو_الاسبوع').setDescription('عرض العضو الأكثر متواجد بالخدمة للأسبوع الحالي')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`[SUCCESS] تم تسجيل الدخول بنجاح كـ ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('[SUCCESS] تم تحديث وتسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('[ERROR] حدث خطأ أثناء تسجيل الأوامر:', error);
    }
});

client.on('interactionCreate', async interaction => {

    // --- 1. أوامر السلاش ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'نظام_التقارير') {
            await interaction.deferReply();
            const reportEmbed = new EmbedBuilder()
                .setTitle('📊 نظام تقديم التقارير الموحد')
                .setDescription('اختر الفئة الخاصة بالتقرير من الزر أدناه لبدء كتابة التقرير الخاص بك.')
                .setColor(0x3498db);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_open_category_select').setLabel('تقديم تقرير جديد 📝').setStyle(ButtonStyle.Primary)
            );

            return await interaction.editReply({ embeds: [reportEmbed], components: [row] });
        }

        if (commandName === 'دفتر_الحضور') {
            await interaction.deferReply();
            const embed = new EmbedBuilder()
                .setTitle('💼 دفتر تسجيل الحضور والغياب للمنظمة')
                .setDescription('استخدم الأزرار أدناه لتسجيل الدخول، الخروج، الغفوة، أو عرض قائمة المتواجدين.')
                .setColor(0x2b2d31);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('org_on').setLabel('تسجيل دخول 📥').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('org_snooze').setLabel('غفوة 💤').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('org_off').setLabel('تسجيل خروج 📤').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('org_list').setLabel('عرض الحضور 📋').setStyle(ButtonStyle.Primary)
            );
            return await interaction.editReply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'جرد_الساعات') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية الاطلاع على جرد الساعات.', ephemeral: true });
            }

            await interaction.deferReply();
            const stats = db.userDutyStats;
            const userKeys = Object.keys(stats);

            if (userKeys.length === 0) {
                return interaction.editReply({ content: '📊 **لا توجد أي بيانات حضور مسبقة للجرد حالياً.**' });
            }

            let reportList = userKeys.map(id => {
                const total = stats[id].totalMs || 0;
                return `• <@${id}> ⬅️ إجمالي الساعات: **${formatDuration(total)}**`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('⏱️ جرد ساعات الحضور والخدمة لجميع الأعضاء')
                .setDescription(reportList)
                .setColor(0x2ecc71)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'لوحة_التحكم') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ هذا الأمر مخصص للمشرفين والإدارة فقط.', ephemeral: true });
            }

            await interaction.deferReply();
            const controlEmbed = new EmbedBuilder()
                .setTitle('⚙️ لوحة التحكم والإشراف العام')
                .setDescription('اختر الإجراء المطلوب إدارته من الأزرار أو القوائم التالية:')
                .setColor(0xf1c40f);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('org_list').setLabel('عرض الحضور الحالي 📋').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('admin_snooze_list').setLabel('عرض الأعضاء بالاستراحة 💤').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('admin_force_off_menu').setLabel('🚫 تسجيل خروج إجباري').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('admin_force_on_menu').setLabel('📥 تسجيل دخول إداري').setStyle(ButtonStyle.Success)
            );

            return await interaction.editReply({ embeds: [controlEmbed], components: [row1] });
        }

        if (commandName === 'فحص_العضو') {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('العضو');
            const targetId = targetUser.id;

            initUserDuty(targetId);
            const totalMs = db.userDutyStats[targetId].totalMs || 0;

            let statusText = '🔴 خارج الخدمة';
            if (db.activeSessions[targetId]) {
                if (db.snoozeSessions[targetId]) {
                    statusText = '💤 في فترة استراحة / غفوة';
                } else {
                    statusText = '🟢 متواجد في الخدمة حالياً';
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`🔍 فحص بيانات الحضور: ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'العضو', value: `<@${targetId}>`, inline: true },
                    { name: 'الحالة الحالية', value: statusText, inline: true },
                    { name: 'إجمالي الساعات المسجلة', value: `⏱️ **${formatDuration(totalMs)}**`, inline: false }
                )
                .setColor(0x3498db)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'عضو_الاسبوع') {
            await interaction.deferReply();
            const stats = db.userDutyStats;
            const candidates = Object.keys(stats).filter(id => !EXCLUDED_USERS.includes(id));

            if (candidates.length === 0) {
                return interaction.editReply({ content: '📊 **لا توجد بيانات كافية لتحديد عضو الأسبوع.**' });
            }

            let topUser = null;
            let maxMs = -1;

            candidates.forEach(id => {
                const ms = stats[id].totalMs || 0;
                if (ms > maxMs) {
                    maxMs = ms;
                    topUser = id;
                }
            });

            if (!topUser || maxMs <= 0) {
                return interaction.editReply({ content: '📊 **لا يوجد أي عضو أتم ساعات حضور بعد.**' });
            }

            const winnerUser = await client.users.fetch(topUser).catch(() => null);

            const winnerEmbed = new EmbedBuilder()
                .setTitle('🏆 ⭐ عضو الأسبوع ⭐ 🏆')
                .setDescription(`تهانينا للعضو المميز والأكثر نشاطاً بالخدمة لهذا الأسبوع!`)
                .setThumbnail(winnerUser ? winnerUser.displayAvatarURL({ dynamic: true }) : null)
                .addFields(
                    { name: '👤 عضو الأسبوع', value: `<@${topUser}>`, inline: true },
                    { name: '⏱️ إجمالي الساعات', value: `**${formatDuration(maxMs)}**`, inline: true }
                )
                .setColor(0xf1c40f)
                .setTimestamp();

            return interaction.editReply({ embeds: [winnerEmbed] });
        }
    }

    // --- 2. التعامل مع الأزرار ---
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const member = interaction.member;
        const userAvatar = interaction.user.displayAvatarURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { hour12: false });

        if (interaction.customId === 'admin_snooze_list') {
            const snoozeUsers = Object.keys(db.snoozeSessions);
            if (snoozeUsers.length === 0) {
                return interaction.reply({ content: '💤 **لا يوجد أي عضو في حالة غفوة/استراحة حالياً.**', ephemeral: true });
            }

            let snoozeText = snoozeUsers.map(id => {
                const snoozeDuration = Date.now() - db.snoozeSessions[id];
                return `• <@${id}> - في استراحة منذ: **${formatDuration(snoozeDuration)}**`;
            }).join('\n');

            const snoozeEmbed = new EmbedBuilder()
                .setTitle('💤 قائمة الأعضاء في فترة الاستراحة/الغفوة')
                .setDescription(snoozeText)
                .setColor(0xe74c3c)
                .setTimestamp();

            return interaction.reply({ embeds: [snoozeEmbed], ephemeral: true });
        }

        if (interaction.customId === 'btn_open_category_select') {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_report_category')
                .setPlaceholder('اختر فئة التقرير المراد تقديمه...')
                .addOptions([
                    { label: 'Recon Team 🔭', value: 'recon', description: 'تقديم تقرير خاص بفريق الاستطلاع' },
                    { label: 'Protection Unit 🛡️', value: 'protection', description: 'تقديم تقرير خاص بوحدة الحماية' },
                    { label: 'Supply Unit 📦', value: 'supply', description: 'تقديم تقرير خاص بوحدة الإمداد' }
                ]);

            return await interaction.reply({
                content: '📌 **الرجاء اختيار الفئة المناسبة لتقريرك:**',
                components: [new ActionRowBuilder().addComponents(selectMenu)],
                ephemeral: true
            });
        }

        if (interaction.customId === 'admin_force_off_menu') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const activeUserIds = Object.keys(db.activeSessions);
            if (activeUserIds.length === 0) {
                return interaction.reply({ content: '❌ لا يوجد أي عضو مسجل بالخدمة حالياً لتسجيل خروجه.', ephemeral: true });
            }

            const selectOptions = activeUserIds.slice(0, 25).map(id => {
                const mem = interaction.guild.members.cache.get(id);
                return {
                    label: mem ? mem.displayName : `عضو آيدي: ${id}`,
                    value: id,
                    description: `ID: ${id}`
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_force_off_user')
                .setPlaceholder('اختر العضو المراد تسجيل خروجه إجبارياً...')
                .addOptions(selectOptions);

            return interaction.reply({
                content: '🚨 **اختر العضو الذي ترغب بتسجيل خروجه إجبارياً:**',
                components: [new ActionRowBuilder().addComponents(selectMenu)],
                ephemeral: true
            });
        }

        if (interaction.customId === 'admin_force_on_menu') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('select_force_on_user')
                .setPlaceholder('اختر العضو المراد تسجيل دخوله...');

            return interaction.reply({
                content: '📥 **اختر العضو لتسجيل دخوله إدارياً إلى الخدمة:**',
                components: [new ActionRowBuilder().addComponents(userSelect)],
                ephemeral: true
            });
        }

        if (interaction.customId === 'org_on') {
            if (db.activeSessions[userId]) {
                return interaction.reply({ content: '❌ أنت مسجل دخولك بالفعل بالخدمة!', ephemeral: true });
            }
            if (db.snoozeSessions[userId]) {
                delete db.snoozeSessions[userId];
            }
            db.activeSessions[userId] = Date.now();
            saveData(db);

            const loginEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setThumbnail(userAvatar)
                .setTitle('🟢 تسجيل دخول للخدمة')
                .setDescription(`قام العضو ${member}\nبتسجيل الدخول للخدمة.`)
                .addFields(
                    { name: 'العضو', value: `${member}`, inline: false },
                    { name: 'وقت البدء', value: `\`${timeString}\``, inline: false }
                );

            await sendToLogChannel(interaction.guild, loginEmbed);
            return interaction.reply({ content: '🟢 **تم تسجيل دخولك بالخدمة بنجاح!**', ephemeral: true });
        }

        if (interaction.customId === 'org_snooze') {
            if (!db.activeSessions[userId]) {
                return interaction.reply({ content: '❌ يجب أن تكون مسجلاً بالخدمة لتتمكن من وضع حسابك في حالة غفوة.', ephemeral: true });
            }

            if (db.snoozeSessions[userId]) {
                const snoozeStart = db.snoozeSessions[userId];
                const snoozeDuration = Date.now() - snoozeStart;

                db.activeSessions[userId] += snoozeDuration;
                delete db.snoozeSessions[userId];
                saveData(db);

                const returnEmbed = new EmbedBuilder()
                    .setColor('#0055FF')
                    .setThumbnail(userAvatar)
                    .setTitle('🟢 العودة للخدمة')
                    .setDescription(`عاد العضو ${member}\nللخدمة الآن.`)
                    .addFields(
                        { name: 'العضو', value: `${member}`, inline: false },
                        { name: 'مدة الغفوة', value: `⏱️ ${formatDuration(snoozeDuration)}`, inline: false }
                    );

                await sendToLogChannel(interaction.guild, returnEmbed);
                return interaction.reply({ content: '🟢 **تم إلغاء وضع الغفوة والعودة للخدمة النشطة!**', ephemeral: true });

            } else {
                db.snoozeSessions[userId] = Date.now();
                saveData(db);

                const startSnoozeEmbed = new EmbedBuilder()
                    .setColor('#0055FF')
                    .setThumbnail(userAvatar)
                    .setTitle('💤 بدء فترة غفوة')
                    .setDescription(`قام العضو ${member}\nببدء غفوة مؤقتة.`)
                    .addFields(
                        { name: 'العضو', value: `${member}`, inline: false },
                        { name: 'وقت البدء', value: `\`${timeString}\``, inline: false }
                    );

                await sendToLogChannel(interaction.guild, startSnoozeEmbed);
                return interaction.reply({ content: '💤 **تم وضعك في حالة غفوة/استراحة مؤقتة.**', ephemeral: true });
            }
        }

        if (interaction.customId === 'org_off') {
            if (!db.activeSessions[userId]) {
                return interaction.reply({ content: '❌ أنت غير مسجل بالخدمة حالياً!', ephemeral: true });
            }

            if (db.snoozeSessions[userId]) {
                const snoozeDuration = Date.now() - db.snoozeSessions[userId];
                db.activeSessions[userId] += snoozeDuration;
                delete db.snoozeSessions[userId];
            }

            const startTime = db.activeSessions[userId];
            const duration = Math.max(0, Date.now() - startTime);
            delete db.activeSessions[userId];

            initUserDuty(userId);
            db.userDutyStats[userId].totalMs += duration;
            saveData(db);

            const logoutEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setThumbnail(userAvatar)
                .setTitle('🔴 خروج من الخدمة')
                .setDescription(`قام العضو ${member}\nبتسجيل الخروج من الخدمة.`)
                .addFields(
                    { name: 'العضو', value: `${member}`, inline: false },
                    { name: 'وقت الانتهاء', value: `\`${timeString}\``, inline: false },
                    { name: 'إجمالي مدة الخدمة', value: `⏱️ ${formatDuration(duration)}`, inline: false }
                );

            await sendToLogChannel(interaction.guild, logoutEmbed);
            return interaction.reply({
                content: `🔴 **تم تسجيل خروجك بنجاح.**\n⏱️ صافي مدة العمل: **${formatDuration(duration)}**`,
                ephemeral: true
            });
        }

        if (interaction.customId === 'org_list') {
            const activeUsers = Object.keys(db.activeSessions);
            if (activeUsers.length === 0) {
                return interaction.reply({ content: '📋 **لا يوجد أي عضو متواجد بالخدمة حالياً.**', ephemeral: true });
            }

            let listText = activeUsers.map(id => {
                let elapsed = Date.now() - db.activeSessions[id];
                let isSnooze = '';
                if (db.snoozeSessions[id]) {
                    const currentSnooze = Date.now() - db.snoozeSessions[id];
                    elapsed -= currentSnooze;
                    isSnooze = ' 💤 *(في غفوة)*';
                }
                return `<@${id}> - متواجد منذ: **${formatDuration(Math.max(0, elapsed))}**${isSnooze}`;
            }).join('\n');

            const listEmbed = new EmbedBuilder()
                .setTitle('📋 قائمة الحضور والنشاط حالياً')
                .setDescription(listText)
                .setColor(0x3498db)
                .setTimestamp();

            return interaction.reply({ embeds: [listEmbed], ephemeral: true });
        }
    }

    // --- 3. التعامل مع القوائم المنسدلة ---
    if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {

        if (interaction.customId === 'select_force_off_user') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const targetUserId = interaction.values[0];
            const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

            if (!db.activeSessions[targetUserId]) {
                return interaction.reply({ content: '❌ هذا العضو غير مسجل بدخول بالخدمة بالفعل!', ephemeral: true });
            }

            delete db.activeSessions[targetUserId];
            if (db.snoozeSessions[targetUserId]) {
                delete db.snoozeSessions[targetUserId];
            }
            saveData(db);

            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { hour12: false });
            const targetAvatar = targetMember ? targetMember.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const forceOffEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setThumbnail(targetAvatar)
                .setTitle('🔴 تسجيل خروج إجباري')
                .setDescription(`تم تسجيل خروج العضو <@${targetUserId}>\nإجبارياً من الخدمة بواسطة المسؤول.`)
                .addFields(
                    { name: 'العضو', value: `<@${targetUserId}>`, inline: false },
                    { name: 'المسؤول', value: `${interaction.member}`, inline: false },
                    { name: 'وقت الخروج الإجباري', value: `\`${timeString}\``, inline: false }
                );

            await sendToLogChannel(interaction.guild, forceOffEmbed);
            return interaction.reply({ content: `✅ **تم تسجيل خروج العضو <@${targetUserId}> إجبارياً وبدون إضافتها لسجل الجرد.**`, ephemeral: true });
        }

        if (interaction.customId === 'select_force_on_user') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const targetUserId = interaction.values[0];
            const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

            if (db.activeSessions[targetUserId]) {
                return interaction.reply({ content: '❌ العضو مسجل دخوله بالفعل بالخدمة.', ephemeral: true });
            }

            db.activeSessions[targetUserId] = Date.now();
            if (db.snoozeSessions[targetUserId]) delete db.snoozeSessions[targetUserId];

            saveData(db);

            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { hour12: false });
            const targetAvatar = targetMember ? targetMember.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const forceOnEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setThumbnail(targetAvatar)
                .setTitle('🟢 تسجيل دخول إداري')
                .setDescription(`تم تسجيل دخول العضو <@${targetUserId}>\nللخدمة إدارياً بواسطة المسؤول.`)
                .addFields(
                    { name: 'العضو', value: `<@${targetUserId}>`, inline: false },
                    { name: 'المسؤول', value: `${interaction.member}`, inline: false },
                    { name: 'وقت البدء', value: `\`${timeString}\``, inline: false }
                );

            await sendToLogChannel(interaction.guild, forceOnEmbed);
            return interaction.reply({ content: `🟢 **تم تسجيل دخول العضو <@${targetUserId}> للخدمة إدارياً بنجاح.**`, ephemeral: true });
        }

        if (interaction.customId === 'select_report_category') {
            const selectedCategory = interaction.values[0];

            if (selectedCategory === 'recon') {
                const modal = new ModalBuilder().setCustomId('modal_recon_unit').setTitle('تقرير Recon Team 🔭');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_num').setLabel('رقم المهمة').setPlaceholder('مثال: RECON-001').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_date').setLabel('التاريخ').setPlaceholder('مثال: 02/08/2026').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_location').setLabel('الموقع').setPlaceholder('الموقع المستطلع').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_times').setLabel('وقت البداية - وقت النهاية').setPlaceholder('مثال: 04:00 PM - 05:00 PM').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_notes').setLabel('الملاحظات (النشاط/المركبات/RP/الأولوية)').setPlaceholder('اكتب الملاحظات + مستوى الأولوية (منخفض/متوسط/مرتفع)').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                return await interaction.showModal(modal);
            }

            if (selectedCategory === 'protection') {
                const modal = new ModalBuilder().setCustomId('modal_protection_unit').setTitle('تقرير Protection Unit 🛡️');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_num').setLabel('رقم المهمة').setPlaceholder('مثال: PROTECT-001').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_type').setLabel('نوع المهمة').setPlaceholder('تأمين اجتماع / مرافقة / فعالية').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_times').setLabel('وقت البداية - وقت النهاية').setPlaceholder('مثال: 06:00 PM - 08:00 PM').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_leader_count').setLabel('القائد المسؤول | عدد أفراد الفريق').setPlaceholder('مثال: القائد: فلان | العدد: 5').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_notes').setLabel('الملاحظات').setPlaceholder('اكتب الملاحظات التفصيلية للمهمة...').setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (selectedCategory === 'supply') {
                const modal = new ModalBuilder().setCustomId('modal_supply_unit').setTitle('تقرير Supply Unit 📦');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_num').setLabel('رقم التقرير والتاريخ').setPlaceholder('رقم التقرير: SUP-001 | التاريخ: XX/XX').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_manager').setLabel('المسؤول').setPlaceholder('اسم أو آيدي المسؤول').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_in_out').setLabel('تم استلام | تم تسليم').setPlaceholder('تم استلام: ... | تم تسليم: ...').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_status').setLabel('حالة المخزون').setPlaceholder('ممتاز / جيد / يحتاج مراجعة').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_notes').setLabel('ملاحظات').setPlaceholder('اكتب أي ملاحظات إضافية حول المخزون...').setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                return await interaction.showModal(modal);
            }
        }
    }

    // --- 4. معالجة Modals التقارير ---
    if (interaction.isModalSubmit()) {
        const { customId, fields, member } = interaction;

        let channelId = null;
        let title = '';
        let embedFields = [];

        if (customId === 'modal_recon_unit') {
            channelId = RECON_PENDING_CHANNEL;
            title = '🔭 تقرير Recon Team جديد';
            embedFields = [
                { name: 'رقم المهمة', value: fields.getTextInputValue('recon_num'), inline: true },
                { name: 'التاريخ', value: fields.getTextInputValue('recon_date'), inline: true },
                { name: 'الموقع', value: fields.getTextInputValue('recon_location'), inline: true },
                { name: 'الأوقات', value: fields.getTextInputValue('recon_times'), inline: true },
                { name: 'الملاحظات', value: fields.getTextInputValue('recon_notes'), inline: false }
            ];
        } else if (customId === 'modal_protection_unit') {
            channelId = PROTECT_PENDING_CHANNEL;
            title = '🛡️ تقرير Protection Unit جديد';
            embedFields = [
                { name: 'رقم المهمة', value: fields.getTextInputValue('prot_num'), inline: true },
                { name: 'نوع المهمة', value: fields.getTextInputValue('prot_type'), inline: true },
                { name: 'الأوقات', value: fields.getTextInputValue('prot_times'), inline: true },
                { name: 'القائد والعدد', value: fields.getTextInputValue('prot_leader_count'), inline: false },
                { name: 'الملاحظات', value: fields.getTextInputValue('prot_notes') || 'لا يوجد', inline: false }
            ];
        } else if (customId === 'modal_supply_unit') {
            channelId = SUPPLY_PENDING_CHANNEL;
            title = '📦 تقرير Supply Unit جديد';
            embedFields = [
                { name: 'رقم التقرير والتاريخ', value: fields.getTextInputValue('sup_num'), inline: true },
                { name: 'المسؤول', value: fields.getTextInputValue('sup_manager'), inline: true },
                { name: 'استلام / تسليم', value: fields.getTextInputValue('sup_in_out'), inline: false },
                { name: 'حالة المخزون', value: fields.getTextInputValue('sup_status'), inline: true },
                { name: 'الملاحظات', value: fields.getTextInputValue('sup_notes') || 'لا يوجد', inline: false }
            ];
        }

        if (channelId) {
            const reportChannel = interaction.guild.channels.cache.get(channelId);
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(0x3498db)
                .setDescription(`مقدم التقرير: ${member}`)
                .addFields(embedFields)
                .setTimestamp();

            if (reportChannel) {
                await reportChannel.send({ embeds: [embed] });
                return await interaction.reply({ content: '✅ **تم إرسال تقريرك بنجاح للمراجعة!**', ephemeral: true });
            } else {
                return await interaction.reply({ content: '❌ حدث خطأ، لم يتم العثور على القناة المخصصة للتقرير.', ephemeral: true });
            }
        }
    }
});

// --- 5. تشغيل البوت ---
// ✅ صحيح
client.login('MTUzMTQ4MTExMDQyMzI3NzY2OQ.GPnPrQ.FrkcPnH9BxjSRCxlownAksy-VA_5zN60MZN6iM');
