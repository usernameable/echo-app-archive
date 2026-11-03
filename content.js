import { wordIcon } from './icons.js';
function unit(id, title, label, words, lines, prompts, fallbackPhrase) {
  const targets = words.map((text, index) => ({ id: `${id}-w${index+1}`, text, icon: wordIcon(text) }));
  const script = lines.map(([speaker, text, translation, new_word_flags, id], index) => ({ id: id ?? `s${index+1}`, speaker, text, translation, new_word_flags }));
  return { id, title, label, targets, script,
    learn: script.filter(line => line.speaker === 'B').map(line => line.id),
    chat: script.map(line => line.id),
    prompts: prompts.map(([text, translation], index) => ({ id: `${id}-p${index+1}`, text, translation, new_word_flags: 0 })),
    fallbackPhrase, segments: ['listen','speak','recap','chat','wrap'] };
}

export const units = [
  unit('U-001','At the doctor','就医情境',
    ['headache','fever','cough','nurse','medicine','appointment','thermometer'],[
      ['A','Good morning. How do you feel?','早上好。你感觉怎么样？',0,'s2'],
      ['B','Good morning, I am here because I do not feel well.','早上好，我来了，因为我不舒服。',0,'s1'],
      ['A','What happened last night? Did you sleep early?','昨晚怎么了？你很早就睡了吗？',0,'s4'],
      ['B','I had a headache last night, so I went to bed early.','昨晚我头疼，所以很早就睡了。',1,'s3'],
      ['A','Did you sleep well, and did you eat your dinner?','你睡得好吗？吃晚饭了吗？',0,'s6'],
      ['B','I slept for a long time, but I did not want any food.','我睡了很久，但不想吃东西。',0,'s5'],
      ['A','You have a fever today, so please drink more water at home.','你今天发烧了，请在家多喝水。',1,'s7'],
      ['B','Can I go to school tomorrow if I feel better in the morning?','如果明早感觉好些，我能去上学吗？',0,'s8'],
      ['A','Yes, but tell your mother if you still feel bad after breakfast.','可以，但早餐后如果仍不舒服，要告诉妈妈。',0,'s9'],
      ['B','Thank you, I will rest today and see how I feel tomorrow.','谢谢，我今天休息，明天再看看感觉如何。',0,'s10']
    ],[['I have a headache.','我头疼。'],['I have a cough.','我咳嗽。'],['I need some medicine.','我需要一些药。']], {text:'headache',translation:'头疼'}),
  unit('U-002','At the restaurant','就餐情境',
    ['menu','soup','salad','order','waiter','fork','bill'],[
      ['A','Good evening. Are you here for dinner?','晚上好。你们是来吃晚饭的吗？',0,'s2'],
      ['B','Good evening, we are here for dinner with my family today.','晚上好，我们一家今天来吃晚饭。',0,'s1'],
      ['A','Here is the menu. This table has a view of the street.','这是菜单。从这张桌子能看到街道。',1,'s4'],
      ['B','That looks nice, and I can see the street from my seat.','那很好，我从座位上能看到街道。',0,'s3'],
      ['A','Would you like something warm? We have soup today.','想吃点热的吗？今天有汤。',1,'s6'],
      ['B','I want something warm because it is cold outside this evening.','我想吃点热的，今晚外面很冷。',0,'s5'],
      ['A','The soup comes in a large bowl.','汤装在一个大碗里。',0,'s8'],
      ['B','That sounds good, but can I have a small bowl first?','听起来不错，我能先要一小碗吗？',0,'s7'],
      ['A','Of course. What would your mother like to eat?','当然。你妈妈想吃什么？',0,'s10'],
      ['B','She would like rice and fish, and we both want water.','她想要米饭和鱼，我们都要水。',0,'s9']
    ],[['May I see the menu?','我能看看菜单吗？'],['I would like a salad.','我想要一份沙拉。'],['Can we have the bill?','可以结账吗？']], {text:'menu',translation:'菜单'}),
  unit('U-003','My weekend plan','周末计划',
    ['picnic','museum','ticket','bicycle','camera','weather','backpack'],[
      ['A','What will you do with your family this weekend?','这个周末你想和家人做什么？',0,'s1'],
      ['B','On Saturday morning, I want to go outside with my sister.','星期六早上，我想和姐姐出门。',0,'s2'],
      ['A','What if the day is warm?','如果天气暖和呢？',0,'a3'],
      ['B','We can have a picnic in the park if the day is warm.','如果天气暖和，我们可以在公园野餐。',1,'s3'],
      ['A','That sounds fun, but what if it rains?','听起来有趣，但如果下雨呢？',0,'s4'],
      ['B','Then we can go to the museum and see old things there.','那我们可以去博物馆看旧物件。',1,'s5'],
      ['A','Have you been to that museum before?','你以前去过那个博物馆吗？',0,'a6'],
      ['B','I went there last year and learned about our city.','我去年去过，了解了这座城市。',0,'s6'],
      ['A','What will you do on Sunday?','星期天你会做什么？',0,'a7'],
      ['B','On Sunday, I will stay at home and read with my father.','星期天我会待在家里和爸爸一起读书。',0,'s7'],
      ['A','Will you also have time to play with your friends outside?','你还有时间和朋友在外面玩吗？',0,'s8'],
      ['B','Yes, we can meet after lunch and play for one hour.','有，我们午饭后见面，玩一个小时。',0,'s9'],
      ['A','What kind of weekend do you like best?','你最喜欢怎样的周末？',0,'a10'],
      ['B','I like a weekend with time for my family and my friends.','我喜欢能陪家人和朋友的周末。',0,'s10']
    ],[['We can visit the museum.','我们可以参观博物馆。'],['I will ride my bicycle.','我会骑自行车。'],['I need my backpack.','我需要背包。']], {text:'museum',translation:'博物馆'}),
  unit('U-004','Asking the way','问路情境',
    ['map','corner','street','traffic','bus','hospital','supermarket'],[
      ['A','Hello, do you need directions to a place nearby?','你好，你需要附近某个地方的路线吗？',0,'s2'],
      ['B','Excuse me, can you help me find the hospital?','打扰一下，你能帮我找到医院吗？',1,'s1'],
      ['A','The hospital is not very close from here.','医院离这里有点远。',0,'s4'],
      ['B','Is it far, or can I walk there in ten minutes?','远吗？我十分钟能走到吗？',0,'s3'],
      ['A','You can walk with me, and I will show you the way.','你可以跟我走，我给你指路。',0,'s6'],
      ['B','That is very kind of you, and I will follow you.','你真好，我跟着你走。',0,'s5'],
      ['A','Go along this road and turn left at the corner.','沿着这条路走，在拐角处左转。',1,'s8'],
      ['B','Do I turn left before or after the big tree?','我在大树前面还是后面左转？',0,'s7'],
      ['A','After the tree, you will see a white building.','过了那棵树，你会看见一栋白楼。',0,'s10'],
      ['B','Thank you so much, and I will go there right now.','太谢谢你了，我现在就过去。',0,'s9']
    ],[['Is the bus stop near the supermarket?','公交车站在超市附近吗？'],
       ['I need a map of this street.','我需要这张街道地图。'],
       ['Please stop at the traffic lights.','请在红绿灯那里停下。']], {text:'hospital',translation:'医院'})
];

export const firstUnit = units[0];
