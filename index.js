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
    AttachmentBuilder,
    UserSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const http = require('http');
const https = require('https');

// --- 0. خادم إبقاء البوت شغالاً 24/7 (متوافق مع Render و UptimeRobot) ---
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.write("Merryweather Bot is Online!");
    res.end();
}).listen(PORT, () => {
    console.log(`[HTTP] Server is running on port ${PORT}`);
});

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
const TOKEN = process.env.DISCORD_TOKEN || 'MTUzMTQ4MTExMDQyMzI3NzY2OQ.GiaAUD.legO5IIKhKRmuAA6CaMKfmlhnZCoreAYHtV6kQ'; 
const CLIENT_ID = '1531481110423277669';
const GUILD_ID  = '1504137101225099415';

// --- آيديات رومات التقارير ---
const RECON_PENDING_CHANNEL     = '1533417338777374842';
const RECON_APPROVED_CHANNEL    = '1533416785758519477';

const PROTECT_PENDING_CHANNEL   = '1533417411938750656';
const PROTECT_APPROVED_CHANNEL  = '1533416727742906418';

const SUPPLY_PENDING_CHANNEL    = '1533417481291563119';
const SUPPLY_APPROVED_CHANNEL   = '1533416591419506748';

const MOD_ROLE_ID               = '1504137101401260141'; 

function downloadImage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function hasModRole(member) {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(MOD_ROLE_ID);
}

function initUserDuty(userId) {
    if (!db.userDutyStats[userId]) {
        db.userDutyStats[userId] = { totalMs: 0, forceOffCount: 0 };
    }
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours} ساعة و ${minutes} دقيقة`;
}

// === تسجيل أوامر السلاش ===
const commands = [
    new SlashCommandBuilder().setName('حضور_المنظمة').setDescription('إرسال لوحة نظام تسجيل الحضور والغياب'),
    new SlashCommandBuilder().setName('لوحة_التحكم').setDescription('إرسال لوحة التحكم والإشراف العام'),
    new SlashCommandBuilder().setName('جرد_الأسبوع').setDescription('استخراج تقرير جرد ساعات الحضور للأسبوع الماضي'),
    new SlashCommandBuilder().setName('جرد_التقارير').setDescription('استخراج إحصائيات تقارير المهام للأسبوع الماضي'),
    new SlashCommandBuilder().setName('تصفير_الجرد').setDescription('تصفير كافة البيانات والتقارير وساعات الحضور لجميع الأعضاء'),
    new SlashCommandBuilder()
        .setName('تعيين_مشرف')
        .setDescription('إعطاء رتبة مشرف لعضو معين')
        .addUserOption(option => option.setName('العضو').setDescription('حدد العضو المراد تعيينه').setRequired(true)),
    new SlashCommandBuilder()
        .setName('إزالة_مشرف')
        .setDescription('سحب رتبة مشرف من عضو معين')
        .addUserOption(option => option.setName('العضو').setDescription('حدد العضو المراد سحب الرتبة منه').setRequired(true)),
    new SlashCommandBuilder().setName('نظام_التقارير').setDescription('إرسال لوحة تقديم التقارير المخصصة حسب الفئة')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`[SUCCESS] تم تسجيل الدخول بنجاح كـ ${client.user.tag}`);
    try {
        if (GUILD_ID && GUILD_ID !== 'ضع_آيدي_سيرفرك_هنا') {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('[SUCCESS] تم تحديث وتفعيل كافة الأوامر فوراً للسيرفر المخصص!');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log('[SUCCESS] تم تحديث الأوامر بشكل عام!');
        }
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
        
        if (commandName === 'حضور_المنظمة') {
            await interaction.deferReply();
            const embed = new EmbedBuilder()
                .setTitle('💼 نظام تسجيل الحضور والغياب للمنظمة - التلاعب في الدفتر عقوبتة سترايك')
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

        if (commandName === 'لوحة_التحكم') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ هذا الأمر مخصص للمشرفين والإدارة فقط.', ephemeral: true });
            }

            await interaction.deferReply();
            const controlEmbed = new EmbedBuilder()
                .setTitle('⚙️ لوحة التحكم والإشراف العام')
                .setDescription('اختر الإجراء المطلوبة إدارته من الأزرار أو القوائم التالية:')
                .setColor(0xf1c40f);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('org_list').setLabel('عرض الحضور الحالي 📋').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('admin_snooze_list').setLabel('عرض الأعضاء بالاستراحة 💤').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('admin_force_off_menu').setLabel('🚫 تسجيل خروج إجباري').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('admin_force_on_menu').setLabel('📥 تسجيل دخول إداري').setStyle(ButtonStyle.Success)
            );

            return await interaction.editReply({ embeds: [controlEmbed], components: [row1] });
        }
    }

    // --- 2. أزرار نظام الحضور والتحكم ---
    if (interaction.isButton()) {
        const userId = interaction.user.id;

        // --- فتح قائمة تسجيل الخروج الإجباري للمشرف ---
        if (interaction.customId === 'admin_force_off_menu') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const activeUserIds = Object.keys(db.activeSessions);
            if (activeUserIds.length === 0) {
                return interaction.reply({ content: '❌ لا يوجد أي عضو مسجل بالخدمة حالياً لتسجيل خروجه.', ephemeral: true });
            }

            const selectOptions = activeUserIds.slice(0, 25).map(id => {
                const member = interaction.guild.members.cache.get(id);
                return {
                    label: member ? member.displayName : `عضو آيدي: ${id}`,
                    value: id,
                    description: `ID: ${id}`
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_force_off_user')
                .setPlaceholder('اختر العضو المراد تسجيل خروجه إجبارياً...')
                .addOptions(selectOptions);

            return interaction.reply({
                content: '🚨 **اختر العضو الذي ترغب بتسجيل خروجه إجبارياً (لن تُحسب ساعاته بالجرد):**',
                components: [new ActionRowBuilder().addComponents(selectMenu)],
                ephemeral: true
            });
        }

        // --- فتح قائمة تسجيل الدخول الإداري ---
        if (interaction.customId === 'admin_force_on_menu') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('select_force_on_user')
                .setPlaceholder('اختر العضو المراد تسجيل دخوله...');

            return interaction.reply({
                content: '📥 **اختر العضو لتسجيل دخوله إلى الخدمة:**',
                components: [new ActionRowBuilder().addComponents(userSelect)],
                ephemeral: true
            });
        }

        // --- تسجيل دخول عادي ---
        if (interaction.customId === 'org_on') {
            if (db.activeSessions[userId]) {
                return interaction.reply({ content: '❌ أنت مسجل دخولك بالفعل بالخدمة!', ephemeral: true });
            }
            if (db.snoozeSessions[userId]) {
                delete db.snoozeSessions[userId];
            }
            db.activeSessions[userId] = Date.now();
            saveData(db);
            return interaction.reply({ content: '🟢 **تم تسجيل دخولك بالخدمة بنجاح!** نتمنى لك توفيقاً.', ephemeral: true });
        }

        // --- غفوة / استراحة مؤقتة (مع خصم الوقت) ---
        if (interaction.customId === 'org_snooze') {
            if (!db.activeSessions[userId]) {
                return interaction.reply({ content: '❌ يجب أن تكون مسجلاً بالخدمة لتتمكن من وضع حسابك في حالة غفوة.', ephemeral: true });
            }

            if (db.snoozeSessions[userId]) {
                const snoozeDuration = Date.now() - db.snoozeSessions[userId];
                db.activeSessions[userId] += snoozeDuration;
                delete db.snoozeSessions[userId];
                saveData(db);
                return interaction.reply({ content: '🟢 **تم إلغاء وضع الغفوة والعودة للخدمة النشطة!** (لم يتم احتساب وقت الغفوة)', ephemeral: true });
            } else {
                db.snoozeSessions[userId] = Date.now();
                saveData(db);
                return interaction.reply({ content: '💤 **تم وضعك في حالة غفوة/استراحة مؤقتة.** (توقف حساب الوقت حتى تعود)', ephemeral: true });
            }
        }

        // --- تسجيل خروج عادي ---
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

            return interaction.reply({ 
                content: `🔴 **تم تسجيل خروجك بنجاح.**\n⏱️ صافي مدة العمل: **${formatDuration(duration)}**`, 
                ephemeral: true 
            });
        }

        // --- عرض الحضور المتواجدين ---
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

        // --- عرض الأعضاء في غفوة للإدارة ---
        if (interaction.customId === 'admin_snooze_list') {
            const snoozeUsers = Object.keys(db.snoozeSessions);
            if (snoozeUsers.length === 0) {
                return interaction.reply({ content: '💤 **لا يوجد أي عضو في حالة غفوة حالياً.**', ephemeral: true });
            }

            let snoozeText = snoozeUsers.map(id => {
                const elapsed = Date.now() - db.snoozeSessions[id];
                return `<@${id}> - في استراحة منذ: **${formatDuration(elapsed)}**`;
            }).join('\n');

            const snoozeEmbed = new EmbedBuilder()
                .setTitle('💤 قائمة الأعضاء في حالة غفوة')
                .setDescription(snoozeText)
                .setColor(0x95a5a6)
                .setTimestamp();

            return interaction.reply({ embeds: [snoozeEmbed], ephemeral: true });
        }

        // --- اختيار الفئة للتقارير ---
        if (interaction.customId === 'btn_open_category_select') {
            const categorySelect = new StringSelectMenuBuilder()
                .setCustomId('select_report_category')
                .setPlaceholder('📁 اختر فئة التقرير...')
                .addOptions([
                    { label: 'Recon Team (الاستطلاع)', value: 'recon', description: 'تقرير مخصص لفريق الاستطلاع', emoji: '🔭' },
                    { label: 'Protection Unit (الحماية)', value: 'protection', description: 'تقرير مخصص لفريق الحماية والتأمين', emoji: '🛡️' },
                    { label: 'Supply Unit (التموين/المستودع)', value: 'supply', description: 'تقرير مخصص لعمليات التموين والمستودع', emoji: '📦' }
                ]);

            return await interaction.reply({
                content: '📌 **الخطوة 1:** اختر الفئة المناسبة لتقريرك:',
                components: [new ActionRowBuilder().addComponents(categorySelect)],
                ephemeral: true
            });
        }

        // --- زر التعديل النصي بواسطة المشرف ---
        if (interaction.customId.startsWith('edit_report_')) {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية تعديل التقرير.', ephemeral: true });
            }

            const category = interaction.customId.split('_')[2];
            const oldEmbed = interaction.message.embeds[0];

            if (category === 'recon') {
                const modal = new ModalBuilder().setCustomId(`modal_edit_save_recon_${interaction.message.id}`).setTitle('تعديل تقرير Recon Team 🔭');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_num').setLabel('رقم المهمة').setValue(oldEmbed.fields[0]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_date').setLabel('التاريخ').setValue(oldEmbed.fields[1]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_location').setLabel('الموقع').setValue(oldEmbed.fields[2]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_times').setLabel('وقت البداية - وقت النهاية').setValue(oldEmbed.fields[3]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('recon_notes').setLabel('الملاحظات والنشاط والأولوية').setValue(oldEmbed.fields[4]?.value || '').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                return await interaction.showModal(modal);
            }

            if (category === 'protection') {
                const modal = new ModalBuilder().setCustomId(`modal_edit_save_protection_${interaction.message.id}`).setTitle('تعديل تقرير Protection Unit 🛡️');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_num').setLabel('رقم المهمة').setValue(oldEmbed.fields[0]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_type').setLabel('نوع المهمة').setValue(oldEmbed.fields[1]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_times').setLabel('التوقيت').setValue(oldEmbed.fields[2]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_leader_count').setLabel('القائد المسؤول والفريق').setValue(oldEmbed.fields[3]?.value || '').setStyle(TextInputStyle.Short).
