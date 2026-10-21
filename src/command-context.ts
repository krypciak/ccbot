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

/// The context in which a slash command runs.
export type CCBotInteraction = commando.CommandoInteraction;

/// The options that can be attached to a response.
export type ResponseOptions = discord.InteractionReplyOptions;

/// Sends the primary response of a command.
///
/// Slash commands are deferred by the framework before they are run,
/// so the response has to be an edit of the deferred reply rather than a reply of its own.
export async function respond(interaction: CCBotInteraction, content: string, options?: ResponseOptions): Promise<discord.Message> {
    const payload: ResponseOptions = {...options};
    if (content)
        payload.content = content;
    else
        delete payload.content;
    if (interaction.isEditable())
        return await interaction.editReply(payload as unknown as discord.InteractionEditReplyOptions);
    const response = await interaction.reply(payload);
    return await response.fetch();
}

/// Sends an additional message on top of the primary response.
export async function followUp(interaction: CCBotInteraction, content: string, options?: ResponseOptions): Promise<discord.Message> {
    const payload: ResponseOptions = {...options};
    if (content)
        payload.content = content;
    else
        delete payload.content;
    return await interaction.followUp(payload);
}

/// Sends the primary response of a command as an embed.
export async function respondWithEmbed(interaction: CCBotInteraction, embed: discord.EmbedBuilder): Promise<void> {
    await respond(interaction, '', {embeds: [embed]});
}

/// Gets the channel the interaction was invoked in.
/// Interactions in DMs and in channels the bot cannot see may not have a cached channel.
export async function getChannel(interaction: CCBotInteraction): Promise<discord.TextBasedChannel> {
    const channel = interaction.channel;
    if (channel)
        return channel as discord.TextBasedChannel;
    const fetched = await interaction.client.channels.fetch(interaction.channelId);
    if (!fetched || !('send' in fetched))
        throw new Error('The channel of this interaction is not text-based.');
    return fetched as discord.TextBasedChannel;
}

/// Normalizes an argument that may be given as a single string or as a list of strings.
/// Slash commands cannot have variadic options, so arguments that used to be lists
///  are now given as one string that has to be split up again.
export function argList(value: string | string[] | null | undefined): string[] {
    if (value === null || value === undefined)
        return [];
    if (Array.isArray(value))
        return value.filter((v: string): boolean => v.length > 0);
    return value.split(/\s+/).filter((v: string): boolean => v.length > 0);
}
