<template>
  <div class="page-wrap">
    <CyberNavbar :title="modeTitle" :show-back="true" @back="router.back()" />

    <!-- 学习进度条 -->
    <div class="progress-wrap" v-if="session.total > 0">
      <van-progress :percentage="progressPct" stroke-width="8" :show-pivot="false" color="#00f5ff" track-color="rgba(255,255,255,0.08)" />
      <div class="progress-text">{{ session.done }}/{{ session.total }} · 已答对 {{ session.correct }} 题</div>
    </div>

    <!-- 学习页面 -->
    <div v-if="page === 'quiz'" class="quiz-wrap">
      <div class="my-card">
        <div v-if="currentWord">
          <div class="header-row">
            <h3 v-if="mode === 'choice'" class="word-title">
              {{ currentWord?.word }}
              <span class="phonetic">{{ currentWord?.phonetic }}</span>
            </h3>
            <h3 v-else class="word-title">&nbsp;</h3>
            <span class="collect-btn" :class="{ loading: collectLoading }" @click="addWordBook">
              ⭐ 加入生词本
            </span>
          </div>

          <!-- 刷单词（选择题） -->
          <div v-if="mode === 'choice'">
            <p class="question-text">请选择正确释义：</p>
            <div class="option-list">
              <button
                v-for="item in optionList"
                :key="item"
                class="option-btn"
                :class="getBtnClass(item)"
                :disabled="hasSubmit"
                @click="selectAnswer(item)"
              >
                {{ item }}
              </button>
            </div>
          </div>

          <!-- 拼写单词 -->
          <div v-if="mode === 'spell'">
            <p class="question-text">中文释义：{{ currentWord?.cnMean }}</p>
            <input
              v-model="userInput"
              class="spell-input"
              placeholder="请输入英文单词"
              @keyup.enter="submitSpell"
              :disabled="hasSubmit"
            />
            <div class="spell-submit">
              <CyberButton variant="primary" @click="submitSpell" :disabled="hasSubmit">提交答案</CyberButton>
            </div>
          </div>

          <!-- 答题结果提示 -->
          <div v-if="hasSubmit" class="result-bar" :class="{ correct: isCorrect, wrong: !isCorrect }">
            {{ isCorrect ? '回答正确 ✔' : `回答错误 ✘ 正确答案：${rightAnswer}` }}
          </div>

          <div class="quiz-actions">
            <CyberButton variant="primary" @click="nextWord">
              {{ isLast ? '完成本组' : '下一题' }}
            </CyberButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 完成弹窗：休息 / 追加 -->
    <div v-if="showFinish" class="finish-overlay">
      <div class="finish-popup">
        <div class="finish-emoji">🎉</div>
        <div class="finish-title">本组完成！</div>
        <div class="finish-score">共 {{ session.total }} 题，答对 {{ session.correct }} 题</div>
        <div class="finish-actions">
          <CyberButton variant="ghost" @click="restNow">休息一下</CyberButton>
          <CyberButton variant="primary" @click="studyAgain" :loading="againLoading">再来一组</CyberButton>
        </div>
      </div>
    </div>

    <!-- 生词本弹窗 -->
    <div v-if="wordBookVisible" class="wordbook-overlay" @click.self="wordBookVisible=false">
      <div class="wordbook-popup">
        <div class="popup-header">生词本</div>
        <div class="table-wrap">
          <table class="word-table">
            <thead>
              <tr>
                <th>单词</th>
                <th>音标</th>
                <th>释义</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in wordBookList" :key="item.id">
                <td>{{ item.word }}</td>
                <td>{{ item.phonetic }}</td>
                <td>{{ item.cnMean }}</td>
                <td>
                  <span class="table-del" @click="removeWord(item.id)">删除</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="wordBookList.length === 0" class="table-empty">
            生词本是空的
          </div>
        </div>
        <div class="popup-footer">
          <CyberButton variant="ghost" block @click="$router.push('/word/notebook')">打开完整生词本</CyberButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showSuccessToast, showFailToast, showToast } from 'vant'
import {
  checkSpellApi,
  checkOptionApi,
  addWordCollect,
  removeWordCollect,
  getMyCollectList
} from '../api/word'
import {
  startStudy,
  reportAnswer,
  finishStudy
} from '../api/study'
import { authState } from '../utils/auth.js'
import request from '../utils/request'
import { CyberNavbar, CyberButton } from './cyber'

const route = useRoute()
const router = useRouter()

// 生词本按 userId 隔离，取当前登录用户（不再硬编码 1）；老会话可能只有 token，兜底再查一次 profile
let collectUserId = authState.user?.id || null

async function ensureCollectUserId() {
  if (collectUserId) return collectUserId
  try {
    const res = await request.get('/user/profile')
    collectUserId = res.user?.id || null
  } catch (e) { /* 未登录时保持 null */ }
  return collectUserId
}

// 词书等级与模式都由前面的页面带进来：/word/study?level=4&mode=choice
const level = route.query.level || '4'
const mode = route.query.mode === 'spell' ? 'spell' : 'choice'
const modeTitle = mode === 'spell' ? '拼写单词' : '刷单词'

const page = ref('loading')
const session = reactive({
  id: null,
  words: [],
  done: 0,
  total: 0,
  correct: 0
})
const index = ref(0)          // 当前第几个单词

const currentWord = computed(() => session.words[index.value] || null)
const isLast = computed(() => index.value >= session.words.length - 1)
const progressPct = computed(() =>
  session.total ? Math.round((session.done / session.total) * 100) : 0
)

const userInput = ref('')
const optionList = ref([])

const hasSubmit = ref(false)
const isCorrect = ref(false)
const rightAnswer = ref('')
const selectedMean = ref('')   // 用户本次选中的选项（判红用，答完即存）

const showFinish = ref(false)
const againLoading = ref(false)

const wordBookVisible = ref(false)
const wordBookList = ref([])
const collectLoading = ref(false)

// 会话内其他单词的释义可作干扰项，不够时用兜底词库
const wrongMeans = ['苹果', '放弃', '思考', '学习', '城市', '河流', '电脑', '书籍', '音乐', '森林', '勇气', '机会']

onMounted(async () => {
  await startSession(false)
})

// 开始/恢复一组学习；again=true 表示完成后再追加一组
async function startSession(again) {
  page.value = 'loading'
  try {
    const res = await startStudy(level, mode)
    if (res.code !== 200 || !res.data) {
      showFailToast(res.msg || '开始学习失败')
      return
    }
    const data = res.data
    if (data.finished) {
      showToast('这个词书已经背完啦，换个词书继续吧～')
      router.replace('/word/book')
      return
    }
    session.id = data.sessionId
    session.words = data.words || []
    session.done = data.done || 0
    session.total = data.total || 0
    session.correct = data.correct || 0
    // 断点续刷：跳到未完成的那个单词
    index.value = Math.min(session.done, session.words.length - 1)
    if (data.resume && session.done > 0) {
      showToast(`已恢复上次进度（第 ${session.done + 1} 题）`)
    } else if (!again && data.sameWordsAsToday) {
      showToast('复习今天的单词')
    }
    resetQuestionState()
    page.value = 'quiz'
  } catch (err) {
    showFailToast(err.message || '网络异常')
  }
}

function resetQuestionState() {
  hasSubmit.value = false
  userInput.value = ''
  selectedMean.value = ''
  isCorrect.value = false
  rightAnswer.value = ''
  if (mode === 'choice') {
    generateOptions()
  }
}

async function addWordBook() {
  const word = currentWord.value
  if (!word?.id) return
  collectLoading.value = true
  try {
    const res = await addWordCollect(await ensureCollectUserId(), word.id)
    if (res.code === 200) {
      showSuccessToast('加入生词本成功')
    } else {
      showFailToast(res.msg)
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  } finally {
    collectLoading.value = false
  }
}

async function loadWordBook() {
  try {
    const res = await getMyCollectList(await ensureCollectUserId())
    if (res.code === 200) {
      wordBookList.value = res.data
    }
  } catch (err) {
    showFailToast('加载生词本失败：' + err.message)
  }
}

async function removeWord(wordId) {
  try {
    const res = await removeWordCollect(await ensureCollectUserId(), wordId)
    if (res.code === 200) {
      showSuccessToast('已移除生词')
      loadWordBook()
    }
  } catch (err) {
    showFailToast(err.message || '删除失败')
  }
}

// 从会话单词里抽干扰项，保证刷题/拼写内容一致的同时选项也更贴近所学词
function generateOptions() {
  if (!currentWord.value) return
  const correct = currentWord.value.cnMean
  const pool = session.words
    .map(w => w.cnMean)
    .filter(m => m && m !== correct)
  const selectedWrong = []
  while (selectedWrong.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    const m = pool.splice(idx, 1)[0]
    if (!selectedWrong.includes(m)) selectedWrong.push(m)
  }
  const fallback = wrongMeans.filter(m => m !== correct && !selectedWrong.includes(m))
  while (selectedWrong.length < 3 && fallback.length > 0) {
    selectedWrong.push(fallback.splice(Math.floor(Math.random() * fallback.length), 1)[0])
  }
  let arr = [correct, ...selectedWrong]
  arr.sort(() => Math.random() - 0.5)
  optionList.value = arr
}

async function selectAnswer(selectMean) {
  if (hasSubmit.value || !currentWord.value) return
  hasSubmit.value = true
  selectedMean.value = selectMean
  const rightMean = currentWord.value.cnMean
  rightAnswer.value = rightMean
  let correct = false
  try {
    const res = await checkOptionApi({ rightMean, selectMean })
    correct = !!res.correct
    isCorrect.value = correct
  } catch (err) {
    showFailToast(err.message)
  }
  reportProgress(correct)
}

async function submitSpell() {
  const val = userInput.value.trim()
  if (!val) {
    showFailToast('请输入单词')
    return
  }
  if (hasSubmit.value || !currentWord.value) return
  hasSubmit.value = true
  const answer = currentWord.value.word
  rightAnswer.value = answer
  let correct = false
  try {
    const res = await checkSpellApi({ answer, input: val })
    correct = !!res.correct
    isCorrect.value = correct
  } catch (err) {
    showFailToast(err.message)
  }
  reportProgress(correct)
}

// 每答一题立即上报，中途退出进度不丢
function reportProgress(correct) {
  if (!session.id) return
  reportAnswer(session.id, correct)
    .then(res => {
      if (res.code === 200 && res.data) {
        session.done = res.data.done
        session.total = res.data.total
      }
    })
    .catch(() => {})
  if (correct) session.correct += 1
}

function getBtnClass(text) {
  if (!hasSubmit.value || !currentWord.value) return ''
  const right = currentWord.value.cnMean
  if (text === right) return 'correct'                                // 正确项：绿色
  if (!isCorrect.value && text === selectedMean.value) return 'wrong' // 只有用户选错的那个：红色
  return ''                                                           // 其余干扰项保持原样
}

async function nextWord() {
  if (!isLast.value) {
    index.value += 1
    resetQuestionState()
    return
  }
  // 最后一题 → 结束本组
  try {
    const res = await finishStudy(session.id)
    if (res.code === 200 && res.data) {
      showFinish.value = true
    }
  } catch (err) {
    showFailToast(err.message || '提交失败')
  }
}

// 完成后：休息 / 追加
function restNow() {
  showFinish.value = false
  router.replace('/word/book')
}

async function studyAgain() {
  againLoading.value = true
  showFinish.value = false
  await startSession(true)
  againLoading.value = false
}
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

/* 进度条 */
.progress-wrap {
  max-width: 620px;
  margin: 14px auto 0;
  padding: 0 16px;
  position: relative;
  z-index: 10;
}

.progress-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

.quiz-wrap {
  max-width: 620px;
  margin: 12px auto 0;
  padding: 0 16px 16px;
  position: relative;
  z-index: 10;
}

.my-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 24px;
}

/* 刷题页 */
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.word-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
  margin: 0;
}

.phonetic {
  font-size: 16px;
  color: var(--accent);
  margin-left: 12px;
  font-weight: 400;
}

.collect-btn {
  font-size: 13px;
  color: var(--warning);
  cursor: pointer;
  padding: 6px 12px;
  border: 1px solid var(--warning);
  border-radius: 8px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.collect-btn:hover {
  background: var(--warning-soft);
}

.collect-btn.loading {
  opacity: 0.5;
  pointer-events: none;
}

.question-text {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 16px 0;
}

/* 选项按钮 */
.option-list {
  margin-top: 12px;
}

.option-btn {
  display: block;
  width: 100%;
  padding: 14px 16px;
  margin: 8px 0;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  text-align: left;
}

.option-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateX(4px);
}

.option-btn:disabled {
  cursor: default;
}

.option-btn.correct {
  background: var(--success-soft);
  border-color: var(--success);
  color: var(--success);
  font-weight: 700;
}

.option-btn.wrong {
  background: var(--danger-soft);
  border-color: var(--danger);
  color: var(--danger);
}

/* 拼写输入 */
.spell-input {
  width: 100%;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  font-size: 16px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.25s var(--ease-out);
}

.spell-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.spell-input:disabled {
  opacity: 0.6;
}

.spell-submit {
  margin-top: 16px;
}

/* 结果提示 */
.result-bar {
  margin-top: 20px;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.result-bar.correct {
  background: var(--success-soft);
  color: var(--success);
  border: 1px solid var(--success);
}

.result-bar.wrong {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid var(--danger);
}

/* 刷题操作 */
.quiz-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.quiz-actions > * {
  flex: 1;
}

/* 完成弹窗 */
.finish-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.finish-popup {
  width: 100%;
  max-width: 360px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 20px;
  padding: 32px 24px 24px;
  text-align: center;
  animation: dialogPop 0.3s var(--ease-out);
}

@keyframes dialogPop {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.finish-emoji {
  font-size: 48px;
}

.finish-title {
  margin-top: 12px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.finish-score {
  margin-top: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.finish-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.finish-actions > * {
  flex: 1;
}

/* 生词本弹窗 */
.wordbook-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.wordbook-popup {
  width: 100%;
  max-width: 700px;
  height: 70vh;
  background: rgba(10, 10, 15, 0.98);
  border: 1px solid var(--accent-border);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: dialogPop 0.3s var(--ease-out);
}

.popup-header {
  padding: 16px;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  border-bottom: 1px solid var(--accent-border);
  font-family: var(--font-display);
  letter-spacing: 1px;
  color: var(--text-primary);
}

.table-wrap {
  flex: 1;
  padding: 12px;
  overflow: auto;
}

.word-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.word-table th, .word-table td {
  border: 1px solid var(--accent-border);
  padding: 10px;
  text-align: left;
}

.word-table th {
  background: var(--bg-elevated);
  color: var(--accent);
  font-weight: 600;
}

.word-table td {
  color: var(--text-secondary);
}

.table-del {
  color: var(--danger);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--danger);
  border-radius: 4px;
  transition: all 0.2s;
}

.table-del:hover {
  background: var(--danger-soft);
}

.table-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.popup-footer {
  padding: 12px;
  border-top: 1px solid var(--accent-border);
}
</style>
