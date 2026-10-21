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
import { CCBot } from './ccbot';

/// A modified version of the CommandDispatcher.
///
/// The bot only uses slash commands, so the message parsing of the library is not used.
/// What this dispatcher does add is throttling for slash commands:
///  the library only throttles message commands.
export default class CCBotCommandDispatcher extends commando.CommandDispatcher {
    declare public readonly client: CCBot;

    public constructor(c: CCBot, r: commando.CommandoRegistry) {
        super(c, r);
    }

    /// Slash commands are not handled by the library's message parser,
    ///  so messages never trigger commands.
    protected shouldHandleMessage(_message: commando.CommandoMessage, _oldMessage?: discord.Message): boolean {
        return false;
    }

    protected async handleChatInputCommand(interaction: commando.CommandoInteraction): Promise<void> {
        const command = interaction.command;
        const throttling = command.throttling;
        // NOTE: The throttle method is protected in the library, but element access
        //  is a way to get to it without changing the library.
        const throttle = throttling ? command['throttle'](interaction.user.id) : null;
        if (throttle && throttling && (throttle.usages + 1 > throttling.usages)) {
            const remaining = (throttle.start + (throttling.duration * 1000) - Date.now()) / 1000;
            await interaction.reply({
                content: `Please wait **${remaining.toFixed(1)} seconds** before using the \`${command.name}\` command again.`,
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        if (throttle)
            throttle.usages++;
        await super.handleChatInputCommand(interaction);
    }
}
