// Copyright (C) 2019-2020 CCDirectLink members
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as discord from 'discord.js';
import * as commando from 'discord.js-commando';
import {CCBot, CCBotCommand} from '../ccbot';
import {emoteSafe, localAdminCheck, mdEsc, naturalComparison} from '../utils';
import {PageSwitcherOutputElement, outputElements} from '../entities/page-switcher';
import {getUserDatablock, userAwareGetEmote} from '../entities/user-datablock';
import {argList, getChannel, respond} from '../command-context';
import {slashInfo, stringOption} from '../slash-options';

/// A command to list the accessible emotes.
export class ListEmotesCommand extends CCBotCommand {
    private sfw: boolean;

    public constructor(client: CCBot, sfw: boolean) {
        const name = sfw ? 'list-emotes-sfw' : 'list-emotes';
        const opt = {
            name,
            description: sfw ? 'Like list-emotes, but always only shows SFW emotes.' : 'Lists the emotes that the channel allows. Can search, or list by guild ID.',
            group: 'general',
            memberName: name
        };
        super(client, opt, slashInfo([
            stringOption('search', 'Search terms (or a guild ID)?', false)
        ]));
        this.sfw = sfw;
    }

    public async run(interaction: commando.CommandoInteraction, args: {search?: string}): Promise<void> {
        const search = args.search ?? '';
        if (search == 'overrides')
            if (!interaction.guild) {
                await respond(interaction, 'Cannot get overrides for a guild that doesn\'t exist.');
                return;
            }
        // User aliases don't apply here, it's the *actual* emote list.
        const refs: string[] = this.client.emoteRegistry.getEmoteRefs(interaction.guild);
        refs.sort(naturalComparison);
        const elements: PageSwitcherOutputElement[] = [];
        const channel = await getChannel(interaction);

        for (const eref of refs) {
            const emote = this.client.emoteRegistry.getEmote(interaction.guild, eref);
            if (!emote || !emoteSafe(emote, channel, this.sfw))
                continue;
            let details = '**Native:**';
            if (search == 'overrides') {
                const overrideType = this.client.emoteRegistry.isOverride(interaction.guild, eref);
                if (!overrideType)
                    continue;
                details = `**${overrideType} override:**`;
            } else {
                // "list-emotes <guild ID>" : emotes per guild
                // "list-emotes XYZ" : Text search "XYZ"
                if ((!(emote instanceof discord.GuildEmoji) || (emote.guild.id !== search)) && !eref.includes(search))
                    continue;
                // Use this to diagnose problematic emotes
                if (emote instanceof discord.GuildEmoji)
                    details = `**${mdEsc(emote.guild.name)} [${emote.guild.id}]:**`;
            }
            elements.push({
                category: details,
                text: `${mdEsc(eref)} ${emote.toString()}`
            });
        }

        if (elements.length > 0)
            await outputElements(this.client, interaction, elements, 20, 2000);
        else
            await respond(interaction, 'No emotes found!');
    }
}

/// A command to say a set of emotes.
export class EmoteCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt: commando.CommandInfo = {
            name: 'emote',
            description: 'Writes out emotes. Use " - " to remove spaces and " \\ " to add newlines.',
            group: 'general',
            memberName: 'emote'
        };
        super(client, opt, slashInfo([
            stringOption('emotes', 'Emotes')
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {emotes: string}): Promise<void> {
        const emotes: string[] = argList(args.emotes);
        if ((emotes.length > 0) && (emotes[0] == 'emote_reset')) {
            if (localAdminCheck(interaction)) {
                this.client.emoteRegistry.updateGlobalEmoteRegistry();
                await respond(interaction, 'It is done.');
                return;
            }
            await respond(interaction, 'Not allowed...');
            return;
        }
        const channel = await getChannel(interaction);
        let text = '';
        let separator = ' ';
        for (let i = 0; i < emotes.length; i++) {
            const emoteArg = emotes[i];
            switch (emoteArg) {
                case '-': {
                    separator = '';
                    break;
                }
                case '\\': {
                    separator = '\n';
                    break;
                }
                default: {
                    const emote = await userAwareGetEmote(this.client, interaction.author, interaction.guild, emoteArg);
                    if (!emote || !emoteSafe(emote, channel))
                        continue;
                    if (text.length > 0)
                        text += separator;
                    text += emote.toString();
                    separator = ' ';
                }
            }
        }
        await respond(interaction, text || 'No emotes or they were all nsfw');
    }
}

/// A command to react with a set of emotes.
export class ReactCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt: commando.CommandInfo = {
            name: 'react',
            description: 'Reacts to a message with the given emotes.',
            group: 'general',
            memberName: 'react',
            // NOTE: The type of this property in the library refers to a type that doesn't exist
            //  in discord.js, so it has to be cast.
            contextMenuCommandTypes: [discord.ApplicationCommandType.Message] as unknown as commando.CommandInfo['contextMenuCommandTypes']
        };
        super(client, opt, slashInfo([
            stringOption('emotes', 'Emote names. Separate them with spaces.'),
            stringOption('message-id', 'The message to react to. Defaults to the latest message.', false),
            stringOption('channel-id', 'The channel the message is in. Defaults to this channel.', false)
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {emotes: string; messageId?: string; channelId?: string}): Promise<void> {
        const emotes: string[] = argList(args.emotes);
        if (emotes.length > 8) {
            await respond(interaction, 'Why?');
            return;
        }
        // The *emote lookup* is based on the source channel,
        //  but the NSFW check is done based on the target channel,
        //  to prevent NSFW emote leakage.
        let targetChannel: discord.TextBasedChannel;
        let targetMessage: discord.Message | null = null;
        if (args.messageId) {
            targetChannel = await getTargetChannel(this.client, interaction, args.channelId);
            try {
                targetMessage = await targetChannel.messages.fetch(args.messageId);
            } catch (_e) {
                await respond(interaction, 'The message doesn\'t seem to exist.');
                return;
            }
        } else {
            // If the command was used as a reply, react to the replied-to message.
            const replied = interaction.options.resolved?.messages?.first();
            targetChannel = replied && replied instanceof discord.Message ? replied.channel : await getChannel(interaction);
            if (replied) {
                try {
                    targetMessage = await targetChannel.messages.fetch(replied.id);
                } catch (_e) {
                    targetMessage = null;
                }
            }
            if (!targetMessage) {
                // Otherwise react to the most recent message in the channel.
                targetMessage = (await targetChannel.messages.fetch({limit: 1})).first() ?? null;
            }
        }
        if (!targetMessage) {
            await respond(interaction, 'There is no message to react to. Give a message ID or use this command as a reply.');
            return;
        }
        const reacted: string[] = [];
        for (const emoteArg of emotes) {
            const emote = await userAwareGetEmote(this.client, interaction.author, interaction.guild, emoteArg);
            if (!emote || !emoteSafe(emote, targetChannel))
                continue;
            await targetMessage.react(emote instanceof discord.GuildEmoji ? emote : emote.name!);
            reacted.push(emoteArg);
        }
        await respond(interaction, reacted.length > 0 ? `Reacted with ${reacted.join(', ')}.` : 'No emotes could be used.');
    }

    /// The message context menu version of the react command:
    ///  lets the user pick an emote from a select menu and reacts with it.
    public async runMessageContextMenu(interaction: commando.CommandoMessageContextMenuCommandInteraction): Promise<void> {
        const targetMessage = interaction.targetMessage;
        const guild = interaction.guild;
        const emotes = await this.getReactionChoices(interaction.user, guild, targetMessage.channel);
        if (emotes.length === 0) {
            await interaction.reply({
                content: 'No emotes are available for you here.',
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        const menu = new discord.StringSelectMenuBuilder()
            .setCustomId('react-emote-select')
            .setPlaceholder('Pick an emote')
            .addOptions(emotes.map((emote: string): discord.StringSelectMenuOptionBuilder =>
                new discord.StringSelectMenuOptionBuilder().setLabel(emote.substring(0, 100)).setValue(emote)));
        const row = new discord.ActionRowBuilder<discord.StringSelectMenuBuilder>().addComponents(menu);
        const reply = await interaction.reply({
            content: 'Which emote should I react with?',
            components: [row],
            flags: discord.MessageFlags.Ephemeral,
            fetchReply: true
        });
        let selection: discord.StringSelectMenuInteraction;
        try {
            selection = await reply.awaitMessageComponent({
                componentType: discord.ComponentType.StringSelect,
                time: 60000
            });
        } catch (_e) {
            await interaction.editReply({
                content: 'Timed out.',
                components: []
            });
            return;
        }
        const emote = await userAwareGetEmote(this.client, interaction.user, guild, selection.values[0]);
        if (!emote || !emoteSafe(emote, targetMessage.channel)) {
            await selection.update({
                content: 'That emote can\'t be used here.',
                components: []
            });
            return;
        }
        await targetMessage.react(emote instanceof discord.GuildEmoji ? emote : emote.name!);
        await selection.update({
            content: `Reacted with ${emote.toString()}.`,
            components: []
        });
    }

    /// Gets the emotes to offer in the context menu, preferring the user's own aliases.
    private async getReactionChoices(user: discord.User, guild: commando.CommandoGuild | null, channel: discord.TextBasedChannel): Promise<string[]> {
        const maxChoices = 25;
        const choices: string[] = [];
        const seen = new Set<string>();
        const add = (name: string): void => {
            if (choices.length >= maxChoices || seen.has(name))
                return;
            seen.add(name);
            choices.push(name);
        };
        // The user's own emote aliases come first.
        const datablock = (await getUserDatablock(this.client, user)).get();
        for (const key of Object.keys(datablock))
            if (key.startsWith('emote-'))
                add(key.substring('emote-'.length));
        // Then fill up with the emotes that are available in this guild.
        const refs = this.client.emoteRegistry.getEmoteRefs(guild);
        refs.sort(naturalComparison);
        for (const ref of refs) {
            if (choices.length >= maxChoices)
                break;
            const emote = this.client.emoteRegistry.getEmote(guild, ref);
            if (emote && emoteSafe(emote, channel))
                add(ref);
        }
        return choices;
    }
}

/// Gets the channel that a react command should target.
async function getTargetChannel(client: CCBot, interaction: commando.CommandoInteraction, channelID: string | undefined): Promise<discord.TextBasedChannel> {
    if (!channelID)
        return await getChannel(interaction);
    const channel = await client.channels.fetch(channelID);
    if (!channel || !channel.isTextBased())
        throw new Error('The channel doesn\'t seem to exist or isn\'t valid for reaction.');
    return channel as discord.TextBasedChannel;
}
