import fetch from "node-fetch";
import fs from "fs";

import { CONFIG } from "./config.js";

const baseurl = "https://tioj.ck.tp.edu.tw";
const dist = "./files/";

async function main() {
    console.time("Main Thread");
    if (!fs.existsSync(dist)) {
        fs.mkdirSync(dist);
    }
    let users = [];
    for (let i = 1; i <= CONFIG.max_index_page_number; i += CONFIG.pressure) {
        const pages = [];
        for (let j = 0; j < CONFIG.pressure && i + j <= CONFIG.max_index_page_number; j++) {
            pages.push(tioj_user_list(i + j));
        }
        users = users.concat((await Promise.all(pages)).reduce((a, b) => a.concat(b), []));
    }
    console.log(users);
    console.log(`Found ${users.length} Users.`);
    fs.writeFileSync(`${dist}_ranks.json`, JSON.stringify(users, null, 2));

    for (let i = 1; i <= users.length; i += CONFIG.pressure) {
        const data = [],
            names = [],
            ranks = [];
        for (let j = 0; j < CONFIG.pressure && i + j < users.length; j++) {
            data.push(user(users[i + j].name));
            names.push(users[i + j].name);
            ranks.push(users[i + j].rank);
        }
        (await Promise.all(data))
            .reduce((a, b) => a.concat([b]), [])
            .forEach((d, i) => {
                d.rank = ranks[i];
                fs.writeFileSync(`${dist}${names[i]}.json`, JSON.stringify(d));
            });
    }
    console.timeEnd("Main Thread");
}

async function tioj_user_list(n = 1) {
    const page_raw = await fetch(`${baseurl}/users?page=${n}`, {
        headers: {
            origin: baseurl,
            referer: `${baseurl}/users?page=${n}`,
            "user-agent": "Mozilla/5.0 TIOJ Stats Card",
        },
    });

    const page = await page_raw.text();

    let raw = [
        ...page.matchAll(
            /<tr>\s*?<td>(\d+?)<\/td>\s*?<td><a href="\/users\/([^]+?)"><img class="img-rounded" src(?:=")?[^]*?"?(?: alt=")?[^]*?(?:" )?\/><\/a><\/td>\s*?<td><a href="\/users\/[^]*?">[^]*?<\/a><\/td>/g
        ),
    ];

    let users = [];
    raw.forEach((row) => {
        users.push({
            name: row[2],
            rank: Number(row[1]),
        });
    });

    return users;
}

async function user_data(username) {
    let user_raw = await fetch(`${baseurl}/users/${username}`, {
        headers: {
            origin: baseurl,
            referer: `${baseurl}/users/${username}`,
            "user-agent": "Mozilla/5.0 TIOJ Stats Card",
        },
    });

    const user_data_raw = await user_raw.text();

    let _name,
        _username,
        _about = "",
        _avatar,
        _user_id = null;

    try {
        [_name, _username] = [...user_data_raw.matchAll(/<h5>([^]+?)<\/h5>\s+?<h6>([^]+?)<\/h6>/g)][0].slice(1);
    } catch (e) {
        console.log("Not Found: Name, Username");
    }

    try {
        [_about] = [...user_data_raw.matchAll(/<dfn>([^]+?)<\/dfn>/g)][0].slice(1);
    } catch (e) {
        console.log("Not Found: About");
    }

    try {
        [_avatar] = [...user_data_raw.matchAll(/<img class="img-rounded img-responsive" src="([^]+?)"/g)][0].slice(1);
    } catch (e) {
        console.log("Not Found: Avatar");
    }

    let problems = {
        success: [],
        warning: [],
        muted: [],
    };

    [...user_data_raw.matchAll(/<a class="text-([^]+?)" href="\/problems\/(\d{4})\/submissions\?filter_user_id=(\d{1,6})">\d{4}<\/a>/g)].forEach((problem) => {
        problems[problem[1]].push(problem[2]);
        _user_id = problem[3];
    });

    return {
        name: _name,
        username: _username,
        about: _about,
        avatar: baseurl + _avatar,
        user_id: _user_id,
        problems: problems,
    };
}

async function user_activity(user_id) {
    let activity_raw = await fetch(`${baseurl}/submissions?filter_user_id=${user_id}`, {
        headers: {
            origin: baseurl,
            referer: `${baseurl}/submissions?filter_user_id=${user_id}`,
            "user-agent": "Mozilla/5.0 TIOJ Stats Card",
        },
    });

    const user_activity_raw = await activity_raw.text();

    let submissions = [];

    [
        ...user_activity_raw.matchAll(
            /<tr>\s+?<td><a href="\/submissions\/\d+?">(\d+?)<\/a><\/td>\s+?<td><a href="\/problems\/\d+?">(\d+?)<\/a><\/td>\s+?<td>([^]+?)<\/td>\s+?<td>(\d+?)<\/td>\s+?<td>(\d+?)<\/td>\s+?<td[^]*?>([^]+?)<\/td>\s+?<td>([^]+?)<\/td>\s+?<td>([^]+?)<\/td>\s+?<td>(\d+?)<\/td>\s+?<td>([^]+?)<\/td>\s+?<\/tr>/g
        ),
    ].forEach((submission) => {
        submissions.push({
            id: submission[1],
            problem: submission[2],
            lang: language(submission[7]),
            status: submission[6],
            time: new Date(submission[10]),
        });
    });

    return submissions.slice(0, 10);
}

async function user(username) {
    let data = await user_data(username);
    let activity = await user_activity(data.user_id);
    data.activity = activity;
    return data;
}

function language(raw) {
    if (raw.includes("c++")) {
        return "C++";
    }
    if (raw.includes("c")) {
        return "C";
    }
    if (raw.includes("python")) {
        return raw.replace("p", "P");
    }
    return raw;
}

export { main };
