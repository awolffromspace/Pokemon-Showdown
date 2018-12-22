/*
* Poll chat plugin
* By bumbadadabum and Zarel.
*/

'use strict';

const moment = require('moment');

class Poll {
	constructor(room, questionData, options) {
		if (room.pollNumber) {
			room.pollNumber++;
		} else {
			room.pollNumber = 1;
		}
		this.room = room;
		this.question = questionData.source;
		this.supportHTML = questionData.supportHTML;
		this.voters = {};
		this.voterIps = {};
		this.totalVotes = 0;
		this.timeout = null;
		this.timeoutMins = 0;
		this.startTime = Date.now();
		this.startedUser = questionData.username;

		this.options = new Map();
		for (const [i, option] of options.entries()) {
			this.options.set(i + 1, {name: option, votes: 0});
		}
	}

	vote(user, option) {
		let ip = user.latestIp;
		let userid = user.userid;

		if (userid in this.voters || ip in this.voterIps) {
			return user.sendTo(this.room, `You have already voted for this poll.`);
		}

		this.voters[userid] = option;
		this.voterIps[ip] = option;
		this.options.get(option).votes++;
		this.totalVotes++;

		this.update();
	}

	blankvote(user, option) {
		let ip = user.latestIp;
		let userid = user.userid;

		if (!(userid in this.voters) || !(ip in this.voterIps)) {
			this.voters[userid] = 0;
			this.voterIps[ip] = 0;
		}

		this.updateTo(user);
	}

	generateVotes() {
		let count = 0;
		let output = '<div style="max-height: 310px; overflow-y: auto;  border-top-right-radius: 4px; border-top-left-radius: 4px;"><table cellspacing="0" style="width: 100%; border: 1px solid #6688aa; border-bottom: none; border-top-right-radius: 4px; border-top-left-radius: 4px;"><tr><td colspan="4" class="poll-td" style="background: rgba(229,234,237,1); background: rgba(229,234,237,1); border-bottom: 1px solid #6688aa; border-top-right-radius: 4px; border-top-left-radius: 4px;"><span style="border: 1px solid #3B763B; color: #2D5A2D; border-radius: 4px; padding: 0 3px;"><i class="fa fa-bar-chart"></i> Poll</span> <strong style="font-size: 11pt; color: #224466">' + this.getQuestionMarkup() + '</strong>';
		this.options.forEach((option, number) => {
			count++;
			if (count === 1) output += "<tr>";
			output += '<td class="poll-td"><button style="background: rgba(232,232,232,1); border: 1px solid #aaaaaa; border-radius: 4px; transition-duration: 0.5s; transition-timing-function: linear;" value="/poll vote ' + number + '" name="send" title="Vote for ' + number + '. ' + Chat.escapeHTML(option.name) + '">' + Chat.escapeHTML(option.name) + '</button></td>';
			if (count >= 4) {
				output += "</tr>";
				count = 0;
			}
		});
		output += '</table></div><div style="padding: 8px 0px; text-align: center; border: 1px solid #6688aa; border-top: none; border-bottom-right-radius: 4px; border-bottom-left-radius: 4px;"><button value="/poll results" name="send" title="View results - you will not be able to vote after viewing results" class="poll-results-btn" style="background: rgba(232,232,232,1); border: 1px solid #aaaaaa; border-radius: 4px; transition-duration: 0.5s; transition-timing-function: linear;"><small>(View results)</small></button></div>';

		return output;
	}

	generateResults(ended, option) {
		let icon = '<span style="border: 1px solid #' + (ended ? '777; color: #555' : '6688aa; color: #2D5A2D') + '; border-radius: 4px; padding: 0 3px;"><i class="fa fa-bar-chart"></i> ' + (ended ? "Poll ended" : "Poll") + '</span>';
		let totalVotes = '<br /><span style="font-style: italic; font-size: 9pt; color: black;">[Total Votes: ' + this.totalVotes + '] (Started by ' + this.startedUser + ' ' + moment(this.startTime).fromNow() + '.)</span></div>';
		let output = '<div style="width: 100%; border: 1px solid #6688aa; border-radius: 4px;"><div class="poll-td" style="background: rgba(229,234,237,1); background: rgba(229,234,237,1); border-bottom: 1px solid #6688aa; border-top-right-radius: 4px; border-top-left-radius: 4px;">' + icon + ' <strong style="font-size: 11pt; color: #224466;">' + this.getQuestionMarkup() + '</strong>';
		output += totalVotes;
		output += '<div style="padding: 8px 15px;"><font color="grey"><small><center>(Options with 0 votes are not shown)</center></small></font><br />';
		output += '<table cellspacing="0" style="width: 100%;margin-top: 3px;">';
		let iter = this.options.entries();

		let i = iter.next();
		let c = 0;
		let colors = ['#79A', '#8A8', '#88B'];
		while (!i.done) {
			if (i.value[1].votes && i.value[1].votes !== 0) {
				let percentage = Math.round((i.value[1].votes * 100) / (this.totalVotes || 1));
				output += '<tr><td><strong>' + (i.value[0] === option ? '<em>' : '') + Chat.escapeHTML(i.value[1].name) + (i.value[0] === option ? '</em>' : '') + '</strong> <small>(' + i.value[1].votes + ' vote' + (i.value[1].votes === 1 ? '' : 's') + ')</small></td><td><span style="font-size: 7pt; background: ' + colors[c % 3] + '; padding-right: ' + (percentage * 3) + 'px; border-radius: 4px;"></span><small>&nbsp;' + percentage + '%</small></td></tr>';
			}
			i = iter.next();
			c++;
		}
		if (option === 0 && !ended) output += '<div><small>(You can\'t vote after viewing results)</small></div>';
		output += '</table>';

		return output;
	}

	getQuestionMarkup() {
		if (this.supportHTML) return this.question;
		return Chat.escapeHTML(this.question);
	}

	getOptionMarkup(option) {
		if (this.supportHTML) return option.name;
		return Chat.escapeHTML(option.name);
	}

	update() {
		let results = [];

		for (let i = 0; i <= this.options.size; i++) {
			results.push(this.generateResults(false, i));
		}

		// Update the poll results for everyone that has voted
		for (let i in this.room.users) {
			let user = this.room.users[i];
			if (user.userid in this.voters) {
				user.sendTo(this.room, `|uhtmlchange|poll${this.room.pollNumber}|${results[this.voters[user.userid]]}`);
			} else if (user.latestIp in this.voterIps) {
				user.sendTo(this.room, `|uhtmlchange|poll${this.room.pollNumber}|${results[this.voterIps[user.latestIp]]}`);
			}
		}
	}

	updateTo(user, connection) {
		if (!connection) connection = user;
		if (user.userid in this.voters) {
			connection.sendTo(this.room, `|uhtmlchange|poll${this.room.pollNumber}|${this.generateResults(false, this.voters[user.userid])}`);
		} else if (user.latestIp in this.voterIps) {
			connection.sendTo(this.room, `|uhtmlchange|poll${this.room.pollNumber}|${this.generateResults(false, this.voterIps[user.latestIp])}`);
		} else {
			connection.sendTo(this.room, `|uhtmlchange|poll${this.room.pollNumber}|${this.generateVotes()}`);
		}
	}

	updateFor(user) {
		if (user.userid in this.voters) {
			user.sendTo(this.room, `|uhtmlchange|poll${this.room.pollNumber}|${this.generateResults(false, this.voters[user.userid])}`);
		}
	}

	display() {
		let votes = this.generateVotes();

		let results = [];

		for (let i = 0; i <= this.options.size; i++) {
			results.push(this.generateResults(false, i));
		}

		for (let i in this.room.users) {
			let thisUser = this.room.users[i];
			if (thisUser.userid in this.voters) {
				thisUser.sendTo(this.room, `|uhtml|poll${this.room.pollNumber}|${results[this.voters[thisUser.userid]]}`);
			} else if (thisUser.latestIp in this.voterIps) {
				thisUser.sendTo(this.room, `|uhtml|poll${this.room.pollNumber}|${results[this.voterIps[thisUser.latestIp]]}`);
			} else {
				thisUser.sendTo(this.room, `|uhtml|poll${this.room.pollNumber}|${votes}`);
			}
		}
	}

	displayTo(user, connection) {
		if (!connection) connection = user;
		if (user.userid in this.voters) {
			connection.sendTo(this.room, `|uhtml|poll${this.room.pollNumber}|${this.generateResults(false, this.voters[user.userid])}`);
		} else if (user.latestIp in this.voterIps) {
			connection.sendTo(this.room, `|uhtml|poll${this.room.pollNumber}|${this.generateResults(false, this.voterIps[user.latestIp])}`);
		} else {
			connection.sendTo(this.room, `|uhtml|poll${this.room.pollNumber}|${this.generateVotes()}`);
		}
	}

	onConnect(user, connection) {
		this.displayTo(user, connection);
	}

	end() {
		let results = this.generateResults(true);

		this.room.send(`|uhtmlchange|poll${this.room.pollNumber}|<div class="infobox">(The poll has ended &ndash; scroll down to see the results)</div>`);
		this.room.add(`|html|${results}`).update();
	}
}

exports.Poll = Poll;

exports.commands = {
	poll: {
		htmlcreate: 'new',
		create: 'new',
		new: function (target, room, user, connection, cmd, message) {
			if (!target) return this.parse('/help poll new');
			target = target.trim();
			if (target.length > 1024) return this.errorReply("Poll too long.");
			if (room.battle) return this.errorReply("Battles do not support polls.");

			let text = Chat.filter(this, target, user, room, connection);
			if (target !== text) return this.errorReply("You are not allowed to use filtered words in polls.");

			const supportHTML = cmd === 'htmlcreate';
			let separator = '';
			if (text.includes('\n')) {
				separator = '\n';
			} else if (text.includes('|')) {
				separator = '|';
			} else if (text.includes(',')) {
				separator = ',';
			} else {
				return this.errorReply("Not enough arguments for /poll new.");
			}

			let params = text.split(separator).map(param => param.trim());

			if (!this.can('minigame', null, room)) return false;
			if (supportHTML && !this.can('declare', null, room)) return false;
			if (!this.canTalk()) return;
			if (room.poll) return this.errorReply("There is already a poll in progress in this room.");
			if (params.length < 3) return this.errorReply("Not enough arguments for /poll new.");

			if (supportHTML) params = params.map(parameter => this.canHTML(parameter));
			if (params.some(parameter => !parameter)) return;

			let options = [];

			for (let i = 1; i < params.length; i++) {
				options.push(params[i]);
			}

			if (options.length > 36) {
				return this.errorReply("Too many options for poll (maximum is 36).");
			}

			room.poll = new Poll(room, {source: params[0], supportHTML: supportHTML, username: user.name}, options);
			room.poll.display();

			this.roomlog(`${user.name} used ${message}`);
			this.modlog('POLL');
			return this.privateModAction(`(A poll was started by ${user.name}.)`);
		},
		newhelp: [`/poll create [question], [option1], [option2], [...] - Creates a poll. Requires: % @ * # & ~`],

		vote: function (target, room, user) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");
			if (!target) return this.parse('/help poll vote');

			if (target === 'blank') {
				room.poll.blankvote(user);
				return;
			}

			let parsed = parseInt(target);
			if (isNaN(parsed)) return this.errorReply("To vote, specify the number of the option.");

			if (!room.poll.options.has(parsed)) return this.sendReply("Option not in poll.");

			room.poll.vote(user, parsed);
		},
		votehelp: [`/poll vote [number] - Votes for option [number].`],

		timer: function (target, room, user) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");

			if (target) {
				if (!this.can('minigame', null, room)) return false;
				if (target === 'clear') {
					if (!room.poll.timeout) return this.errorReply("There is no timer to clear.");
					clearTimeout(room.poll.timeout);
					room.poll.timeout = null;
					room.poll.timeoutMins = 0;
					return this.add("The poll timer was turned off.");
				}
				let timeout = parseFloat(target);
				if (isNaN(timeout) || timeout <= 0 || timeout > 0x7FFFFFFF) return this.errorReply("Invalid time given.");
				if (room.poll.timeout) clearTimeout(room.poll.timeout);
				room.poll.timeoutMins = timeout;
				room.poll.timeout = setTimeout(() => {
					room.poll.end();
					delete room.poll;
				}, (timeout * 60000));
				room.add(`The poll timer was turned on: the poll will end in ${timeout} minute(s).`);
				this.modlog('POLL TIMER', null, `${timeout} minutes`);
				return this.privateModAction(`(The poll timer was set to ${timeout} minute(s) by ${user.name}.)`);
			} else {
				if (!this.runBroadcast()) return;
				if (room.poll.timeout) {
					return this.sendReply(`The poll timer is on and will end in ${room.poll.timeoutMins} minute(s).`);
				} else {
					return this.sendReply("The poll timer is off.");
				}
			}
		},
		timerhelp: [
			`/poll timer [minutes] - Sets the poll to automatically end after [minutes] minutes. Requires: % @ * # & ~`,
			`/poll timer clear - Clears the poll's timer. Requires: % @ * # & ~`,
		],

		results: function (target, room, user) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");

			return room.poll.blankvote(user);
		},
		resultshelp: [`/poll results - Shows the results of the poll without voting. NOTE: you can't go back and vote after using this.`],

		close: 'end',
		stop: 'end',
		end: function (target, room, user) {
			if (!this.can('minigame', null, room)) return false;
			if (!this.canTalk()) return;
			if (!room.poll) return this.errorReply("There is no poll running in this room.");
			if (room.poll.timeout) clearTimeout(room.poll.timeout);

			room.poll.end();
			delete room.poll;
			this.modlog('POLL END');
			return this.privateModAction(`(The poll was ended by ${user.name}.)`);
		},
		endhelp: [`/poll end - Ends a poll and displays the results. Requires: % @ * # & ~`],

		show: 'display',
		display: function (target, room, user, connection) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");
			if (!this.runBroadcast()) return;
			room.update();

			if (this.broadcasting) {
				room.poll.display();
			} else {
				room.poll.displayTo(user, connection);
			}
		},
		displayhelp: [`/poll display - Displays the poll`],

		votes: function (target, room, user) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");
			if (!this.runBroadcast()) return;
			this.sendReplyBox("Total Votes: " + room.poll.totalVotes);
		},

		'': function (target, room, user) {
			this.parse('/help poll');
		},
	},
	pollhelp: [
		`/poll allows rooms to run their own polls. These polls are limited to one poll at a time per room.`,
		`Accepts the following commands:`,
		`/poll create [question], [option1], [option2], [...] - Creates a poll. Requires: % @ * # & ~`,
		`/poll htmlcreate [question], [option1], [option2], [...] - Creates a poll, with HTML allowed in the question and options. Requires: # & ~`,
		`/poll vote [number] - Votes for option [number].`,
		`/poll timer [minutes] - Sets the poll to automatically end after [minutes]. Requires: % @ * # & ~`,
		`/poll results - Shows the results of the poll without voting. NOTE: you can't go back and vote after using this.`,
		`/poll display - Displays the poll`,
		`/poll end - Ends a poll and displays the results. Requires: % @ * # & ~`,
	],

	votes: function (target, room, user) {
		if (!room.poll) return this.errorReply("There is no poll running in this room.");
		if (!this.runBroadcast()) return;
		room.poll.update();
		let votes = room.poll.totalVotes;
		return this.sendReplyBox("Total Votes: " + votes);
	},
	ep: 'endpoll',
	endpoll: function (target, room, user) {
		this.parse('/poll end');
	},
	pr: 'pollremind',
	pollremind: function (target, room, user) {
		if (!room.poll) return this.errorReply("There is no poll running in this room.");
		if (!this.runBroadcast()) return;
		room.poll.update();
		if (this.broadcasting) {
			room.update();
			room.poll.display(user, this.broadcasting);
		} else {
			this.parse('/poll display');
		}
	},
	tpoll: 'tourpoll',
	tournamentpoll: 'tourpoll',
	tourneypoll: 'tourpoll',
	tourpoll: function (target, room, user) {
		const formats = ['OU', 'Ubers', 'UU', 'Let\'s Go Random', 'Random', 'BSS Factory', 'Monotype Random', 'Past Gen Random (random pick)', '1v1 Random', 'Tiered Random (random pick)', 'Generational Random', 'Region Random (random pick)', 'Color Random', 'Inverse Random', 'Metronome 3v3 Random'];
		this.parse('/poll new Tournament format?, ' + formats);
	},
	teampoll: function (target, room, user) {
		const formats = ['OU', 'Ubers', 'UU', 'RU', 'NU', 'PU', 'LC', 'VGC', 'Monotype'];
		this.parse('/poll new Tournament format?, ' + formats);
	},
	randbatpoll: 'randompoll',
	randbatspoll: 'randompoll',
	randpoll: 'randompoll',
	randompoll: function (target, room, user) {
		const formats = ['Let\'s Go Random', 'Random', 'BSS Factory', 'Monotype Random', 'Past Gen Random (random pick)', '1v1 Random', 'Tiered Random (random pick)', 'Generational Random', 'Region Random (random pick)', 'Color Random', 'Inverse Random', 'Metronome 3v3 Random'];
		this.parse('/poll new Tournament format?, ' + formats);
	},
	vote: function (target, room, user) {
		if (!target) return this.errorReply("Usage: /vote [poll option number] - votes for the [option] in the current poll.");
		this.parse('/poll vote ' + target);
	},
};

process.nextTick(() => {
	Chat.multiLinePattern.register('/poll (new|create|htmlcreate) ');
});
