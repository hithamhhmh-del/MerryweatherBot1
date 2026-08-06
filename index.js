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
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_leader_count').setLabel('القائد المسؤول والفريق').setValue(oldEmbed.fields[3]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prot_notes').setLabel('الملاحظات').setValue(oldEmbed.fields[4]?.value || '').setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (category === 'supply') {
                const modal = new ModalBuilder().setCustomId(`modal_edit_save_supply_${interaction.message.id}`).setTitle('تعديل تقرير Supply Unit 📦');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_num').setLabel('رقم التقرير والتاريخ').setValue(oldEmbed.fields[0]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_manager').setLabel('المسؤول').setValue(oldEmbed.fields[1]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_in_out').setLabel('تم استلام | تم تسليم').setValue(oldEmbed.fields[2]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_status').setLabel('حالة المخزون').setValue(oldEmbed.fields[3]?.value || '').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_notes').setLabel('ملاحظات').setValue(oldEmbed.fields[4]?.value || '').setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                return await interaction.showModal(modal);
            }
        }

        // --- أزرار الاعتماد والرفض ---
        if (interaction.customId.startsWith('approve_report_') || interaction.customId.startsWith('reject_report_')) {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية رئيس الفرقة/المشرف لاعتماد التقارير.', ephemeral: true });
            }

            await interaction.deferUpdate();

            const isApprove = interaction.customId.startsWith('approve_report_');
            const category = interaction.customId.split('_')[2];

            const oldEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(oldEmbed);

            if (isApprove) {
                updatedEmbed.setColor(0x2ecc71);
                updatedEmbed.addFields({ name: '📌 الحالة', value: `✅ **تم الاعتماد بواسطة:** <@${interaction.user.id}>`, inline: false });

                let approvedChannelId;
                if (category === 'recon') approvedChannelId = RECON_APPROVED_CHANNEL;
                else if (category === 'protection') approvedChannelId = PROTECT_APPROVED_CHANNEL;
                else if (category === 'supply') approvedChannelId = SUPPLY_APPROVED_CHANNEL;

                const approvedChannel = interaction.guild.channels.cache.get(approvedChannelId);

                if (approvedChannel) {
                    await approvedChannel.send({ embeds: [updatedEmbed] });

                    const nextMessages = await interaction.channel.messages.fetch({ after: interaction.message.id, limit: 2 });
                    const imageMsg = nextMessages.find(m => m.attachments.size > 0);

                    if (imageMsg) {
                        const attachments = Array.from(imageMsg.attachments.values()).map(a => a.url);
                        await approvedChannel.send({ content: '📸 **الإثباتات والصور المرفقة:**', files: attachments });
                    }
                }

                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('approved_btn').setLabel('تم الاعتماد ✅').setStyle(ButtonStyle.Success).setDisabled(true)
                );

                return await interaction.editReply({ embeds: [updatedEmbed], components: [disabledRow] });

            } else {
                updatedEmbed.setColor(0xe74c3c);
                updatedEmbed.addFields({ name: '📌 الحالة', value: `❌ **تم الرفض بواسطة:** <@${interaction.user.id}>`, inline: false });

                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('rejected_btn').setLabel('تم الرفض ❌').setStyle(ButtonStyle.Danger).setDisabled(true)
                );

                return await interaction.editReply({ embeds: [updatedEmbed], components: [disabledRow] });
            }
        }
    }

    // --- 3. التعامل مع القوائم المنسدلة (Select Menus) ---
    if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {

        // --- تنفيذ تسجيل الخروج الإجباري (عدم احتساب الوقت) ---
        if (interaction.customId === 'select_force_off_user') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const targetUserId = interaction.values[0];

            if (!db.activeSessions[targetUserId]) {
                return interaction.reply({ content: '❌ هذا العضو غير مسجل بدخول بالخدمة بالفعل!', ephemeral: true });
            }

            // إزالة الجلسات دون إضافة الوقت لساعاته
            delete db.activeSessions[targetUserId];
            if (db.snoozeSessions[targetUserId]) {
                delete db.snoozeSessions[targetUserId];
            }

            initUserDuty(targetUserId);
            db.userDutyStats[targetUserId].forceOffCount += 1; // زيادة عداد الخروج الإجباري
            saveData(db);

            return interaction.reply({
                content: `🚨 **تم تسجيل خروج العضو <@${targetUserId}> إجبارياً بنجاح.**\n⚠️ **تنبيه:** لم يتم احتساب ساعات هذه الجلسة في الجرد النهائي.`,
                ephemeral: true
            });
        }

        // --- تنفيذ تسجيل الدخول الإداري ---
        if (interaction.customId === 'select_force_on_user') {
            if (!hasModRole(interaction.member)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية المشرف.', ephemeral: true });
            }

            const targetUserId = interaction.values[0];

            if (db.activeSessions[targetUserId]) {
                return interaction.reply({ content: '❌ العضو مسجل دخوله بالفعل بالخدمة.', ephemeral: true });
            }

            db.activeSessions[targetUserId] = Date.now();
            if (db.snoozeSessions[targetUserId]) delete db.snoozeSessions[targetUserId];
            saveData(db);

            return interaction.reply({
                content: `🟢 **تم تسجيل دخول العضو <@${targetUserId}> إلى الخدمة بواسطة المشرف.**`,
                ephemeral: true
            });
        }

        // --- اختيار فئة التقارير ---
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

    // --- 4. تقديم النماذج والـ Modals ---
    if (interaction.isModalSubmit()) {
        
        // --- أ) معالجة حفظ تعديل التقرير النصي من قِبل المشرف ---
        if (interaction.customId.startsWith('modal_edit_save_')) {
            const parts = interaction.customId.split('_');
            const category = parts[3];
            const targetMsgId = parts[4];

            const targetMsg = await interaction.channel.messages.fetch(targetMsgId).catch(() => null);
            if (!targetMsg) return interaction.reply({ content: '❌ تعذر العثور على رسالة التقرير الأصلية.', ephemeral: true });

            const oldEmbed = targetMsg.embeds[0];
            const updatedEmbed = EmbedBuilder.from(oldEmbed);

            if (category === 'recon') {
                updatedEmbed.setFields(
                    { name: '🔢 رقم المهمة', value: interaction.fields.getTextInputValue('recon_num'), inline: true },
                    { name: '📅 التاريخ', value: interaction.fields.getTextInputValue('recon_date'), inline: true },
                    { name: '📍 الموقع', value: interaction.fields.getTextInputValue('recon_location'), inline: true },
                    { name: '⏰ التوقيت', value: interaction.fields.getTextInputValue('recon_times'), inline: false },
                    { name: '📝 الملاحظات والنشاط والأولوية', value: interaction.fields.getTextInputValue('recon_notes'), inline: false }
                );
            } else if (category === 'protection') {
                updatedEmbed.setFields(
                    { name: '🔢 رقم المهمة', value: interaction.fields.getTextInputValue('prot_num'), inline: true },
                    { name: '🎯 نوع المهمة', value: interaction.fields.getTextInputValue('prot_type'), inline: true },
                    { name: '⏰ التوقيت', value: interaction.fields.getTextInputValue('prot_times'), inline: false },
                    { name: '👑 القائد والفريق', value: interaction.fields.getTextInputValue('prot_leader_count'), inline: false },
                    { name: '📝 الملاحظات', value: interaction.fields.getTextInputValue('prot_notes') || 'لا يوجد', inline: false }
                );
            } else if (category === 'supply') {
                updatedEmbed.setFields(
                    { name: '🔢 رقم التقرير والتاريخ', value: interaction.fields.getTextInputValue('sup_num'), inline: false },
                    { name: '👤 المسؤول', value: interaction.fields.getTextInputValue('sup_manager'), inline: true },
                    { name: '📦 حركة الاستلام والتسليم', value: interaction.fields.getTextInputValue('sup_in_out'), inline: false },
                    { name: '📊 حالة المخزون', value: interaction.fields.getTextInputValue('sup_status'), inline: true },
                    { name: '📝 ملاحظات', value: interaction.fields.getTextInputValue('sup_notes') || 'لا يوجد', inline: false }
                );
            }

            await targetMsg.edit({ embeds: [updatedEmbed] });
            return await interaction.reply({ content: '✏️ **تم تحديث النصوص في التقرير بنجاح!** يمكنك الآن قبوله أو رفضه.', ephemeral: true });
        }

        // --- ب) معالجة تقديم تقرير جديد من قِبل العضو ---
        let category = '';
        let pendingChannelId = '';
        let embed = new EmbedBuilder().setTimestamp().setFooter({ text: `تم التقديم بواسطة: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        if (interaction.customId === 'modal_recon_unit') {
            category = 'recon';
            pendingChannelId = RECON_PENDING_CHANNEL;
            embed.setTitle('🔭 تقرير استطلاع جديد - Recon Team')
                .setColor(0x9b59b6)
                .addFields(
                    { name: '🔢 رقم المهمة', value: interaction.fields.getTextInputValue('recon_num'), inline: true },
                    { name: '📅 التاريخ', value: interaction.fields.getTextInputValue('recon_date'), inline: true },
                    { name: '📍 الموقع', value: interaction.fields.getTextInputValue('recon_location'), inline: true },
                    { name: '⏰ التوقيت', value: interaction.fields.getTextInputValue('recon_times'), inline: false },
                    { name: '📝 الملاحظات والنشاط والأولوية', value: interaction.fields.getTextInputValue('recon_notes'), inline: false }
                );
        } else if (interaction.customId === 'modal_protection_unit') {
            category = 'protection';
            pendingChannelId = PROTECT_PENDING_CHANNEL;
            embed.setTitle('🛡️ تقرير حماية جديد - Protection Unit')
                .setColor(0x34495e)
                .addFields(
                    { name: '🔢 رقم المهمة', value: interaction.fields.getTextInputValue('prot_num'), inline: true },
                    { name: '🎯 نوع المهمة', value: interaction.fields.getTextInputValue('prot_type'), inline: true },
                    { name: '⏰ التوقيت', value: interaction.fields.getTextInputValue('prot_times'), inline: false },
                    { name: '👑 القائد والفريق', value: interaction.fields.getTextInputValue('prot_leader_count'), inline: false },
                    { name: '📝 الملاحظات', value: interaction.fields.getTextInputValue('prot_notes') || 'لا يوجد', inline: false }
                );
        } else if (interaction.customId === 'modal_supply_unit') {
            category = 'supply';
            pendingChannelId = SUPPLY_PENDING_CHANNEL;
            embed.setTitle('📦 تقرير مستودع/تموين جديد - Supply Unit')
                .setColor(0xe67e22)
                .addFields(
                    { name: '🔢 رقم التقرير والتاريخ', value: interaction.fields.getTextInputValue('sup_num'), inline: false },
                    { name: '👤 المسؤول', value: interaction.fields.getTextInputValue('sup_manager'), inline: true },
                    { name: '📦 حركة الاستلام والتسليم', value: interaction.fields.getTextInputValue('sup_in_out'), inline: false },
                    { name: '📊 حالة المخزون', value: interaction.fields.getTextInputValue('sup_status'), inline: true },
                    { name: '📝 ملاحظات', value: interaction.fields.getTextInputValue('sup_notes') || 'لا يوجد', inline: false }
                );
        }

        if (category !== '') {
            await interaction.reply({ content: '📸 **يرجى إرسال صور/إثباتات التقرير في هذا الشات (لديك 30 ثانية)...**', ephemeral: true });

            const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
            const collector = interaction.channel.createMessageCollector({ filter, time: 30000 });
            let imageFiles = [];

            collector.on('collect', async message => {
                for (const att of message.attachments.values()) {
                    try {
                        const buf = await downloadImage(att.url);
                        const ext = att.name ? att.name.split('.').pop() : 'png';
                        imageFiles.push(new AttachmentBuilder(buf, { name: `proof_${imageFiles.length + 1}.${ext}` }));
                    } catch (e) {
                        console.error('فشل تنزيل الصورة:', e);
                    }
                }
                await message.delete().catch(() => null);
                await interaction.editReply({ content: `📸 **تم استلام (${imageFiles.length}) صورة وحفظها.. جاري تحويل التقرير للمراجعة.**` }).catch(() => null);
            });

            collector.on('end', async () => {
                const targetChannel = interaction.guild.channels.cache.get(pendingChannelId);
                if (!targetChannel) {
                    return interaction.editReply({ content: '❌ تعذر العثور على روم المراجعة الخاص بهذه الفئة.' }).catch(() => null);
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_report_${category}`).setLabel('قبول واعتماد ✅').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`edit_report_${category}`).setLabel('تعديل التقرير ✏️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`reject_report_${category}`).setLabel('رفض التقرير ❌').setStyle(ButtonStyle.Danger)
                );

                await targetChannel.send({ embeds: [embed], components: [row] });

                if (imageFiles.length > 0) {
                    await targetChannel.send({ content: '📸 **الإثباتات والصور المرفقة:**', files: imageFiles });
                }

                await interaction.editReply({ content: '✅ **تم إرسال تقريرك بنجاح إلى روم المراجعة بانتظار اعتماد رئيس الفرقة!**' }).catch(() => null);
            });
        }
    }
});

// --- 5. تشغيل البوت ---
client.login(TOKEN);
