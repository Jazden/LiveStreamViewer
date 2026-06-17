// Default stream definitions for Matrix Stream Console
const defaultChannels = [
    { name: "KHOU 11", url: "https://video.tegnaone.com/khou/live/v1/master/f9c1bf9ffd6ac86b6173a7c169ff6e3f4efbd693/KHOU-Production/live/index.m3u8", type: "hls", category: "News", active: true },
    { name: "ABC13 Live Traffic", url: "https://d1vl9tp8xqmy48.cloudfront.net/out/v1/31268545ebea4ba99158e1348f1f4a2d/ADHOC-KTRK-02-cmaf-manifest/ADHOC-KTRK-02-index_2.m3u8", type: "hls", category: "News", active: true },
    { name: "KPRC 2", url: "https://pubads.g.doubleclick.net/ssai/event/jHV2RfV4QQuU2swXQUVHsA/master.m3u8", type: "hls", category: "News", active: true },
    { name: "Bloomberg Business News Live", url: "https://www.youtube.com/watch?v=iEpJwprxDdk", type: "youtube", category: "News", active: true },
    { name: "Galveston - Skycam North", url: "https://use01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.fjfebpl.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Weather Cams", active: true },
    { name: "Galveston - Skycam South", url: "https://use01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.yykibrj.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Weather Cams", active: true },
    { name: "Galveston - Seawall (Beach View)", url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.ranl5w.fd0.sm1.av1.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Beach Cams", active: true },
    { name: "Galveston - Seawall 28th St", url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.ranl5w.fd0.sm1.av1.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Beach Cams", active: false },
    { name: "Galveston - Downtown Square", url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.qlyfdf9.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "City Views", active: true },
    { name: "Galveston - Harbor House", url: "https://usw01-smr04-relay.ozolio.com/hls-live/_definst_/relay01.zcsqd9k.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "City Views", active: true },
    { name: "Galveston - 61st & Seawall", url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.qghrexk.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Beach Cams", active: true },
    { name: "Galveston - East Beach Overlook", url: "https://usw01-smr04-relay.ozolio.com/hls-live/_definst_/relay01.odojbkb.fd0.sm1.av1.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Beach Cams", active: true },
    { name: "Galveston - Babe's Beach Cam", url: "https://use01-smr03-relay.ozolio.com/hls-live/_definst_/relay01.vzcxdtz.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Beach Cams", active: true },
    { name: "Bolivar - Fort Travis (Lighthouse View)", url: "https://live6.brownrice.com:444/fttravisernst/fttravisernst.stream/main_playlist.m3u8", type: "hls", category: "Beach Cams", active: false },
    { name: "Bolivar - Sunrise Beach", url: "https://live3.brownrice.com:444/coastaloutdoorssunrisebeach/coastaloutdoorssunrisebeach.stream/main_playlist.m3u8", type: "hls", category: "Beach Cams", active: false },
    { name: "Bolivar - Bluewater Beach", url: "https://live6.brownrice.com:444/coastaloutdoorscrystalbeach/coastaloutdoorscrystalbeach.stream/main_playlist.m3u8", type: "hls", category: "Beach Cams", active: false },
    { name: "Bolivar - Crystal Beach", url: "https://live6.brownrice.com:444/coastalsurfcam/coastalsurfcam.stream/main_playlist.m3u8", type: "hls", category: "Beach Cams", active: false },
    { name: "Bolivar - Stingaree Restaurant", url: "https://live6.brownrice.com:444/coastaloutdoorseastbay/coastaloutdoorseastbay.stream/main_playlist.m3u8", type: "hls", category: "Beach Cams", active: false },
    { name: "Bolivar - Rollover Pass Cam", url: "https://live6.brownrice.com:444/coastaloutdoorsrolloverpass/coastaloutdoorsrolloverpass.stream/main_playlist.m3u8", type: "hls", category: "Beach Cams", active: false },
    { name: "Local Weather Forecast", url: "weather", type: "weather", category: "Weather Cams", active: false },
    { name: "Console Event Log", url: "notes", type: "notes", category: "General", active: false }
];
