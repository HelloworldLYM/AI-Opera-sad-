(function () {
  const fallbackAudioUrl = '/legacy/audio/opera-background.mp3';
  const operaDictionaryHome = 'http://cjfzyjzx.scyishu.org.cn/';
  const liyuanPlayUrl = (opera) => `https://liyuan.xikao.com/play/${encodeURIComponent(opera)}`;
  const availableAudioSlugs = new Set([
    'hua-rong-dao',
    'gu-cheng-hui',
    'zhan-wan-cheng',
    'xiang-ma-zhuan',
    'ding-jun-shan',
    'jin-shan-si',
  ]);
  const publicVideoTemplates = [
    {
      label: '哔哩哔哩检索',
      type: 'video-search',
      url: (query) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}`,
    },
    {
      label: '优酷检索',
      type: 'video-search',
      url: (query) => `https://so.youku.com/search_video/q_${encodeURIComponent(query)}`,
    },
    {
      label: '全网检索',
      type: 'web-search',
      url: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
    },
  ];

  const entries = {
    guanyu: ['关羽', '华容道', '关羽 义释曹操', 'hua-rong-dao'],
    zhangfei: ['张飞', '古城会', '张飞 古城会', 'gu-cheng-hui'],
    dianwei: ['典韦', '战宛城', '典韦 战宛城', 'zhan-wan-cheng'],
    chengyaojin: ['程咬金', '响马传', '程咬金 响马传', 'xiang-ma-zhuan'],
    jiangwei: ['姜维', '铁笼山', '姜维 铁笼山', 'tie-long-shan'],
    xiahouyuan: ['夏侯渊', '定军山', '夏侯渊 定军山', 'ding-jun-shan'],
    yuwenchengdu: ['宇文成都', '车轮战', '宇文成都 车轮战', 'che-lun-zhan'],
    julingshen: ['巨灵神', '大闹天宫', '巨灵神 大闹天宫', 'da-nao-tian-gong'],
    fahai: ['法海', '金山寺', '法海 金山寺 白蛇传', 'jin-shan-si'],
    douerdun: ['窦尔敦', '盗御马', '窦尔敦 盗御马', 'dao-yu-ma'],
    zhengziming: ['郑子明', '斩黄袍', '郑子明 斩黄袍', 'zhan-huang-pao'],
    nirong: ['倪荣', '打渔杀家', '倪荣 打渔杀家', 'da-yu-sha-jia'],
  };

  function buildEntry(key, config) {
    const [faceTitle, opera, cue, slug] = config;
    const query = `戏曲 ${opera} ${cue} 原版 全剧 经典唱段`;
    const localAudioUrl = `/legacy/audio/cantos/${slug}.mp3`;
    const audioReady = availableAudioSlugs.has(slug);
    return {
      faceKey: key,
      faceTitle,
      opera,
      cantoTitle: `《${opera}》经典唱段`,
      cue,
      localAudioUrl,
      audioUrl: audioReady ? localAudioUrl : '',
      audioReady,
      fallbackAudioUrl,
      searchQuery: query,
      videoCandidates: [
        {
          label: '川剧发展研究中心',
          type: 'sichuan-opera-site',
          url: operaDictionaryHome,
          note: `打开川剧发展研究中心官网，在站内检索《${opera}》`,
        },
        {
          label: '梨园戏考·剧目资料',
          type: 'opera-archive-site',
          url: liyuanPlayUrl(opera),
          note: `直达《${opera}》剧目资料页，辅助查找剧种、版本与演出资料`,
        },
        ...publicVideoTemplates.map((platform) => ({
          label: platform.label,
          type: platform.type,
          url: platform.url(query),
          note: '跳转后选择全本、名家或官方上传版本',
        })),
      ],
      agentSummary: `Agent 已为${faceTitle}匹配剧目《${opera}》，并生成原视频检索入口。`,
    };
  }

  window.OperaMediaCatalog = {
    version: '2026-05-27',
    fallbackAudioUrl,
    faces: Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, buildEntry(key, value)])),
  };
})();
