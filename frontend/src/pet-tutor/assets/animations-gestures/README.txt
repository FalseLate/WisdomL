上层交互动画库（叠加在底层 idle 之上，播完自动淡出）

用法：
1) 安检：node tools/check-vrma.cjs 文件.vrma （大幅度/表演类素材放这里，不要放 animations/）
2) 命名：动作语义英文名，如 nod.vrma / wave.vrma / think.vrma
3) 触发：组件已暴露 playGesture("nod")；点击角色会自动尝试 wave/nod
   后续 AI 说话结束等事件触发逻辑接入时喊我。

注意：这里的动画播放时底层 idle 不停止（权重降到0.15让位），播完自动归还。
