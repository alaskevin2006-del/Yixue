export const courses=[{id:'cpp',name:'C++ 程序设计'},{id:'math1',name:'高等数学（上）'},{id:'math2',name:'高等数学（下）'},{id:'ds',name:'数据结构'}];
export const resources=[
 {id:'public-stl',course:'cpp',name:'STL 容器与迭代器（示例）.txt',type:'复习资料',year:'2024',body:'逸学公共资料示例\n\n这是一份用于验证查看与下载操作的示例节选，不是真实课程讲义。\n\nvector::erase 会使被删除位置及之后的 iterator 失效。循环删除时，删除分支接住 erase 的返回值；未删除分支递增。'},
 {id:'public-cpp',course:'cpp',name:'程序设计习题（示例）.txt',type:'习题',year:'2025',body:'逸学公共资料示例\n\n练习：从整数 vector 中删除偶数，并检查连续删除相邻元素时的 iterator 更新。'},
 {id:'public-limit',course:'math1',name:'极限与连续（示例）.txt',type:'复习资料',year:'2025',body:'逸学公共资料示例\n\n复习时区分函数在一点有定义、极限存在和连续这三个条件。'},
 {id:'public-tree',course:'ds',name:'树的遍历（示例）.txt',type:'习题',year:'2025',body:'逸学公共资料示例\n\n分别写出一棵二叉树的先序、中序与后序遍历。'}
];
export const candidates={
 'cpp-erase':{id:'loop',title:'循环删除时的 iterator 更新',body:'之前容易把删除与保留元素的两个分支混在一起。\n\n删除时接住 erase 返回的新 iterator；未删除时才递增。\n\n下次尝试连续删除两个相邻元素，检查是否跳过元素。'},
 'cpp-virtual':{id:'virtual',title:'虚析构函数的使用场景',body:'上次只检查了派生类析构，忽略了通过 Base* 删除的情况。\n\n下次读代码时，先确认删除所用的指针类型。'}
};
