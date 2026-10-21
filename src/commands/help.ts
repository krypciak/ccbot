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
import {PageSwitcherOutputElement, outputElements} from '../entities/page-switcher';
import {respond} from '../command-context';
import {slashInfo, stringOption} from '../slash-options';

/// The help command.
export default class HelpCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt = {
            name: 'help',
            description: 'provides the text you\'re reading!',
            group: 'general',
            memberName: 'help'
        };
        super(client, opt, slashInfo([
            stringOption('command', 'The command to get help for. Leave empty for the full list.', false)
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {command?: string}): Promise<void> {
        if (args.command) {
            await this.showCommandHelp(interaction, args.command);
            return;
        }
        const elements: PageSwitcherOutputElement[] = [];
        for (const group of this.client.registry.groups.values()) {
            const commands = Array.from(group.commands.values())
                .filter((cmd: commando.Command): boolean => cmd.description !== 'UNDOCUMENTED');
            if (commands.length === 0)
                continue;
            for (const cmd of commands) {
                elements.push({
                    category: `__**${group.name}**__`,
                    text: `**/${cmd.name}**: ${cmd.description}`
                });
            }
        }
        if (elements.length === 0) {
            await respond(interaction, 'There are no commands to show.');
            return;
        }
        await outputElements(this.client, interaction, elements, 10, 2000);
    }

    /// Shows the details of a single command.
    private async showCommandHelp(interaction: commando.CommandoInteraction, name: string): Promise<void> {
        let cmd: commando.Command;
        try {
            cmd = this.client.registry.resolveCommand(name.toLowerCase().replace(/^\//, ''));
        } catch (_e) {
            await respond(interaction, `There is no command called \`${name}\`.`);
            return;
        }
        const embed = new discord.EmbedBuilder()
            .setTitle(`/${cmd.name}`)
            .setDescription(cmd.description)
            .setFooter({text: `Group: ${cmd.group.name}`});
        if (cmd.details)
            embed.addFields({name: 'Details', value: cmd.details});
        const options = cmd.slashCommand?.options ?? [];
        if (options.length > 0)
            embed.addFields({
                name: 'Options',
                value: options.map((option): string => `\`${option.name}\`: ${option.description}${option.required ? '' : ' (optional)'}`).join('\n')
            });
        if (cmd.examples && cmd.examples.length > 0)
            embed.addFields({name: 'Examples', value: cmd.examples.map((example: string): string => `\`${example}\``).join('\n')});
        await respond(interaction, '', {embeds: [embed]});
    }
}
