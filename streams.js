// Default stream definitions for Matrix Stream Console
// By default, the user's library starts empty so they can choose their own channels.
const defaultChannels = [];

// Curated Public Stream Catalog categorized for the Stream Browser
const PUBLIC_STREAM_CATALOG = [
    // --- NEWS ---
    { 
        name: "KHOU 11", 
        url: "https://video.tegnaone.com/khou/live/v1/master/f9c1bf9ffd6ac86b6173a7c169ff6e3f4efbd693/KHOU-Production/live/index.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "Houston local breaking news, weather, and community reports.", 
        emoji: "📺" 
    },
    { 
        name: "ABC13 Live Traffic", 
        url: "https://d1vl9tp8xqmy48.cloudfront.net/out/v1/31268545ebea4ba99158e1348f1f4a2d/ADHOC-KTRK-02-cmaf-manifest/ADHOC-KTRK-02-index_2.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "Live Houston metro traffic cameras and transit conditions from ABC13.", 
        emoji: "🚦" 
    },
    { 
        name: "KPRC 2", 
        url: "https://pubads.g.doubleclick.net/ssai/event/jHV2RfV4QQuU2swXQUVHsA/master.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "Houston local news coverage, weather radar, and live reports.", 
        emoji: "📰" 
    },
    { 
        name: "Bloomberg Business News Live", 
        url: "https://www.youtube.com/watch?v=iEpJwprxDdk", 
        type: "youtube", 
        category: "News", 
        desc: "Global business, financial markets, and economic breaking news 24/7.", 
        emoji: "📈" 
    },
    { 
        name: "ABC News Live", 
        url: "https://abcnews-streams.akamaized.net/hls/live/2023560/abcnewshudson1/master_4000.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "24/7 national and global breaking news broadcasts and deep-dive reports.", 
        emoji: "🌐" 
    },
    { 
        name: "DW News Live", 
        url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "Deutsche Welle international broadcast channel offering reports and world perspectives.", 
        emoji: "🇩🇪" 
    },
    { 
        name: "Al Jazeera English", 
        url: "https://live-hls-web-aja2-gcp.thehlive.com/AJA2/index.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "Al Jazeera English international live broadcast news channel.", 
        emoji: "📡" 
    },
    { 
        name: "France 24 English", 
        url: "https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_2300.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "France 24 English live stream, international breaking news and reporting.", 
        emoji: "🇫🇷" 
    },
    { 
        name: "NHK World Japan", 
        url: "https://masterpl.hls.nhkworld.jp/hls/w/live/smarttv.m3u8", 
        type: "hls", 
        category: "News", 
        desc: "NHK World-Japan English language live channel covering Japanese news and culture.", 
        emoji: "🇯🇵" 
    },

    // --- CAMERAS ---
    { 
        name: "Galveston - Skycam North", 
        url: "https://use01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.fjfebpl.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "A panoramic high-altitude view overlooking the northern side of Galveston.", 
        emoji: "🧭" 
    },
    { 
        name: "Galveston - Skycam South", 
        url: "https://use01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.yykibrj.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Panoramic southern view toward the Gulf of Mexico from Galveston.", 
        emoji: "🔭" 
    },
    { 
        name: "Galveston - Seawall (Beach View)", 
        url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.ranl5w.fd0.sm1.av1.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Scenic webcam overlooking the famous boardwalk, beach, and surf of Galveston.", 
        emoji: "🌴" 
    },
    { 
        name: "Galveston - Seawall 28th St", 
        url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.ranl5w.fd0.sm1.av1.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Live coastal camera view at 28th Street and Seawall Boulevard.", 
        emoji: "🏖️" 
    },
    { 
        name: "Galveston - Downtown Square", 
        url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.qlyfdf9.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Historic downtown Galveston Strand district shopping and street view.", 
        emoji: "🏛️" 
    },
    { 
        name: "Galveston - Harbor House", 
        url: "https://usw01-smr04-relay.ozolio.com/hls-live/_definst_/relay01.zcsqd9k.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "High-definition streaming cam overlooking Galveston harbor and ship channel.", 
        emoji: "🚢" 
    },
    { 
        name: "Galveston - 61st & Seawall", 
        url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.qghrexk.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Beachfront view at 61st Street and Seawall Boulevard.", 
        emoji: "🌊" 
    },
    { 
        name: "Galveston - East Beach Overlook", 
        url: "https://usw01-smr04-relay.ozolio.com/hls-live/_definst_/relay01.odojbkb.fd0.sm1.av1.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "East Beach coastline overlook toward the entrance of the bay.", 
        emoji: "🌅" 
    },
    { 
        name: "Galveston - Babe's Beach Cam", 
        url: "https://use01-smr03-relay.ozolio.com/hls-live/_definst_/relay01.vzcxdtz.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt12843.rc0.edge.basic.stream/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Babe's Beach coastline, surf conditions, and sunbathers.", 
        emoji: "🏄" 
    },
    { 
        name: "Bolivar - Fort Travis (Lighthouse View)", 
        url: "https://live6.brownrice.com:444/fttravisernst/fttravisernst.stream/main_playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Fort Travis historic park and lighthouse channel view on Bolivar Peninsula.", 
        emoji: "🗼" 
    },
    { 
        name: "Bolivar - Sunrise Beach", 
        url: "https://live3.brownrice.com:444/coastaloutdoorssunrisebeach/coastaloutdoorssunrisebeach.stream/main_playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Tranquil coastal camera overlooking Sunrise Beach on Bolivar Peninsula.", 
        emoji: "🌅" 
    },
    { 
        name: "Bolivar - Bluewater Beach", 
        url: "https://live6.brownrice.com:444/coastaloutdoorscrystalbeach/coastaloutdoorscrystalbeach.stream/main_playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Bluewater Beach surf, tide line, and coastline views.", 
        emoji: "🏖️" 
    },
    { 
        name: "Bolivar - Crystal Beach", 
        url: "https://live6.brownrice.com:444/coastalsurfcam/coastalsurfcam.stream/main_playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Crystal Beach shoreline camera monitoring vehicular traffic and waves.", 
        emoji: "🐚" 
    },
    { 
        name: "Bolivar - Stingaree Restaurant", 
        url: "https://live6.brownrice.com:444/coastaloutdoorseastbay/coastaloutdoorseastbay.stream/main_playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "East Bay marina, boats, and restaurant harbor at Stingaree.", 
        emoji: "🎣" 
    },
    { 
        name: "Bolivar - Rollover Pass Cam", 
        url: "https://live6.brownrice.com:444/coastaloutdoorsrolloverpass/coastaloutdoorsrolloverpass.stream/main_playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Waterway and coastline camera overlooking Rollover Pass on Bolivar.", 
        emoji: "🌊" 
    },
    { 
        name: "Tokyo Shibuya Crossing", 
        url: "https://www.youtube.com/watch?v=H-30B0cqh88", 
        type: "youtube", 
        category: "Cameras", 
        desc: "Real-time webcam viewing the world-famous Shibuya pedestrian crossing in Tokyo, Japan.", 
        emoji: "🏙️" 
    },
    { 
        name: "PhillyCAM Live", 
        url: "https://livestream.telvue.com/phillycam1/f7b44cfafd5c52223d5498196c8a2e7b.sdp/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Philadelphia community access television stream covering city events and stories.", 
        emoji: "🔔" 
    },
    { 
        name: "Escambia Florida Beach Cam", 
        url: "https://cpcdn.azureedge.net/ESCAMBIACOFLLIVE1/ESCAMBIACOFLLIVE1/playlist.m3u8", 
        type: "hls", 
        category: "Cameras", 
        desc: "Scenic webcam overlooking Pensacola Beach in Escambia County, Florida.", 
        emoji: "⛱️" 
    },

    // --- WIDGETS & TOOLS ---
    { 
        name: "Daily Safety Message", 
        url: "safety", 
        type: "safety", 
        category: "Widgets & Tools", 
        desc: "Dynamic daily workplace safety banner synced with custom Excel or CSV schedules.", 
        emoji: "🛡️" 
    },
    { 
        name: "Local Weather Forecast", 
        url: "weather", 
        type: "weather", 
        category: "Widgets & Tools", 
        desc: "Real-time atmospheric dashboard with temperature, humidity, wind, pollen, and 5-day forecast.", 
        emoji: "⛅" 
    },
    { 
        name: "Console Event Log", 
        url: "notes", 
        type: "notes", 
        category: "Widgets & Tools", 
        desc: "In-stream notepad and operational event journal with rich Markdown formatting.", 
        emoji: "📝" 
    },
    { 
        name: "PowerBI Sample Report", 
        url: "https://playground.powerbi.com/sampleReportEmbed", 
        type: "iframe", 
        category: "Widgets & Tools", 
        desc: "Interactive business intelligence report and KPI dashboard embedded via iframe.", 
        emoji: "📊" 
    },

    // --- NATURE & SPACE ---
    { 
        name: "NASA TV Live", 
        url: "https://www.youtube.com/watch?v=21X5lGlDOfg", 
        type: "youtube", 
        category: "Nature & Space", 
        desc: "Official live stream of NASA television, featuring space exploration updates and ISS coverage.", 
        emoji: "🪐" 
    }
];
