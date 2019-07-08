import * as commando from 'discord.js-commando';
import * as structures from './data/structures';
import JSONCommand from './commands/json';
import {CCBot} from './ccbot';

// Not nice.
(commando as any).CommandDispatcher = require('discord.js-commando/src/dispatcher');

/**
 * 
 * A modified version of the CommandDispatcher.
 */
class CCBotCommandDispatcher extends (commando.CommandDispatcher as any) {
    
    constructor(c: CCBot, r: commando.CommandRegistry) {
        super(c, r);
    }

    parseMessage(message: any): any {
        // Stage 1: Prefix removal, cleanup
        let text: string = message.content;
        
        // The regexes used here are taken from the older code.

        // Trim
        text = text.replace(/^\s+|\s+$/g, '');
        
        //  Get & remove the prefix
        let commandPrefix: string;
        if (message.guild) {
            commandPrefix = message.guild.commandPrefix;
        } else {
            commandPrefix = this.client.commandPrefix;
        }
        commandPrefix = commandPrefix || '<@' + this.client.user.id + '>';
        
        if (text.startsWith(commandPrefix)) {
            text = text.substring(commandPrefix.length);
        } else if (!message.guild) {
            text = text;
        } else {
            return null;
        }
        
        // Stage 2: Further Stuff

        // Remove mentions
        text = text.replace(/<@!?(.*?)>/g, '');
        // Trim (again!)
        text = text.replace(/^\s+|\s+$/g, '');

        // Stage 3: Parse The Command
        let group = '-general';
        if (text.startsWith('-')) {
            const cutPoint1 = text.indexOf(' ');
            if (cutPoint1 != -1) {
                group = text.substring(1, cutPoint1);
                text = text.substring(cutPoint1);
                // Trim (once more)
                text = text.replace(/^\s+|\s+$/g, '');
            }
        }
        let command = text;
        const cutPoint2 = text.indexOf(' ');
        if (cutPoint2 != -1) {
            command = text.substring(0, cutPoint2);
            text = text.substring(cutPoint2);
            // Trim (yet again)
            text = text.replace(/^\s+|\s+$/g, '');
        } else {
            text = '';
        }
        
        // console.log([group, command, text]);
        
        // Stage 4: Actually Figure Out What Command It Is
        const groupInst: commando.CommandGroup | undefined = this.registry.groups.get(group);
        if (!groupInst)
            return new commando.CommandMessage(message, this.registry.unknownCommand, text);
        
        const commandInst: commando.Command | undefined = groupInst.commands.find('memberName', command);
        if (!commandInst)
            return new commando.CommandMessage(message, this.registry.unknownCommand, text);

        return new commando.CommandMessage(message, commandInst, text);
    }
}

export default CCBotCommandDispatcher as any;