<template>
  <div class="page-wrap">
    <CyberNavbar title="单词刷题" :show-back="true" @back="backHome" />

    <!-- 初始选择页 -->
    <div v-if="page === 'select'" class="select-wrap">
      <div class="my-card">
        <h2 class="card-title">单词刷题</h2>

        <div class="form-item">
          <div class="label">题目类型</div>
          <div class="radio-group">
            <label class="radio-item" :class="{ checked: form.type === 'option' }" @click="form.type='option'">
              <span class="radio-dot"></span>四选一选择题
            </label>
            <label class="radio-item" :class="{ checked: form.type === 'spell' }" @click="form.type='spell'">
              <span class="radio-dot"></span>拼写默写题
            </label>
          </div>
        </div>

        <div class="form-item">
          <div class="label">单词等级</div>
          <div class="select-field" @click="showLevelPopup = true">
            <span>{{ form.level === '4' ? '四级' : '六级' }}</span>
            <span class="select-arrow">›</span>
          </div>
        </div>

        <!-- 等级选择弹窗 -->
        <div v-if="showLevelPopup" class="level-popup-overlay" @click.self="showLevelPopup=false">
          <div class="level-popup">
            <div class="popup-title">选择单词等级</div>
            <div
              class="level-option"
              :class="{ active: form.level === '4' }"
              @click="selectLevel('4')"
            >四级</div>
            <div
              class="level-option"
              :class="{ active: form.level === '6' }"
              @click="selectLevel('6')"
            >六级</div>
            <div class="popup-cancel" @click="showLevelPopup=false">取消</div>
          </div>
        </div>

        <div class="btn-group">
          <CyberButton variant="primary" @click="startQuiz">开始刷题</CyberButton>
          <CyberButton variant="ghost" @click="openWordBook">生词本</CyberButton>
        </div>
      </div>
    </div>

    <!-- 刷题页面 -->
    <div v-if="page === 'quiz'" class="quiz-wrap">
      <div class="my-card">
        <div v-if="currentWord">
          <div class="header-row">
            <h3 v-if="form.type === 'option'" class="word-title">
              {{ currentWord?.word }}
              <span class="phonetic">{{ currentWord?.phonetic }}</span>
            </h3>
            <h3 v-else class="word-title">&nbsp;</h3>
            <span class="collect-btn" :class="{ loading: collectLoading }" @click="addWordBook">
              ⭐ 加入生词本
            </span>
          </div>

          <!-- 选择题模式 -->
          <div v-if="form.type === 'option'">
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

          <!-- 拼写默写模式 -->
          <div v-if="form.type === 'spell'">
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
            <CyberButton variant="primary" @click="nextWord">下一题</CyberButton>
            <CyberButton variant="ghost" @click="backHome">返回首页</CyberButton>
          </div>
        </div>

        <!-- 单词为空提示 -->
        <div v-else class="empty-word">
          <p>暂无该等级单词，请先导入单词数据</p>
          <CyberButton variant="primary" @click="backHome">返回选择页</CyberButton>
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
          <CyberButton variant="ghost" block @click="wordBookVisible=false">关闭</CyberButton>
        </div>
      </div>
    </div>

    <!-- AI 口语陪练虚拟人（pet-tutor 模块）：桌宠+对话+语音+翻译 -->
    <PetTutor api-base="http://127.0.0.1:8081" session-id="word-quiz-user" />
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import {
  getRandomWord,
  checkSpellApi,
  checkOptionApi,
  addWordCollect,
  removeWordCollect,
  getMyCollectList
} from '../api/word'
import { CyberNavbar, CyberButton } from './cyber'
import PetTutor from '../pet-tutor/PetTutor.vue'

const userId = ref(1)

const page = ref('select')
const form = reactive({
  type: 'option',
  level: '4'
})

const showLevelPopup = ref(false)

const currentWord = ref(null)
const optionList = ref([])
const userInput = ref('')

const hasSubmit = ref(false)
const isCorrect = ref(false)
const rightAnswer = ref('')
const selectedMean = ref('')   // 用户本次选中的选项（判红用，答完即存）

const wordBookVisible = ref(false)
const wordBookList = ref([])
const collectLoading = ref(false)

const wrongMeans = ['苹果', '放弃', '思考', '学习', '城市', '河流', '电脑', '书籍']

function selectLevel(level) {
  form.level = level
  showLevelPopup.value = false
}

async function addWordBook() {
  if (!userId.value) {
    showFailToast('请先登录！')
    return
  }
  const word = currentWord.value
  if (!word?.id) return
  collectLoading.value = true
  try {
    const res = await addWordCollect(userId.value, word.id)
    if(res.code === 200){
      showSuccessToast('加入生词本成功')
    }else{
      showFailToast(res.msg)
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  } finally {
    collectLoading.value = false
  }
}

async function loadWordBook() {
  if (!userId.value) {
    showFailToast('请先登录')
    return
  }
  try {
    const res = await getMyCollectList(userId.value)
    if (res.code === 200) {
      wordBookList.value = res.data
    }
  } catch (err) {
    showFailToast('加载生词本失败：' + err.message)
  }
}

async function removeWord(wordId) {
  try {
    const res = await removeWordCollect(userId.value, wordId)
    if (res.code === 200) {
      showSuccessToast('已移除生词')
      loadWordBook()
    }
  } catch (err) {
    showFailToast(err.message || '删除失败')
  }
}

async function openWordBook() {
  await loadWordBook()
  wordBookVisible.value = true
}

async function startQuiz() {
  if (!form.level) {
    showFailToast('请选择单词等级')
    return
  }
  page.value = 'quiz'
  await fetchNewWord()
}

async function fetchNewWord() {
  hasSubmit.value = false
  userInput.value = ''
  selectedMean.value = ''
  optionList.value = []
  try {
    const res = await getRandomWord(form.level)
    if(res.code === 200 && res.data){
      currentWord.value = res.data
      if (form.type === 'option') {
        generateOptions()
      }
    }else{
      showFailToast(res.msg || "没有该等级单词数据")
      currentWord.value = null
    }
  } catch (err) {
    showFailToast(err.message || "加载单词异常")
    currentWord.value = null
  }
}

function generateOptions() {
  if(!currentWord.value) return
  const correct = currentWord.value.cnMean
  const temp = [...wrongMeans]
  const selectedWrong = []
  while (selectedWrong.length < 3) {
    const idx = Math.floor(Math.random() * temp.length)
    const m = temp.splice(idx, 1)[0]
    if (m !== correct) selectedWrong.push(m)
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
  try {
    const res = await checkOptionApi({
      rightMean,
      selectMean
    })
    isCorrect.value = res.correct
  } catch (err) {
    showFailToast(err.message)
  }
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
  try {
    const res = await checkSpellApi({
      answer,
      input: val
    })
    isCorrect.value = res.correct
  } catch (err) {
    showFailToast(err.message)
  }
}

function getBtnClass(text) {
  if (!hasSubmit.value || !currentWord.value) return ''
  const right = currentWord.value.cnMean
  if (text === right) return 'correct'                                // 正确项：绿色
  if (!isCorrect.value && text === selectedMean.value) return 'wrong' // 只有用户选错的那个：红色
  return ''                                                           // 其余干扰项保持原样
}

async function nextWord() {
  await fetchNewWord()
}

function backHome() {
  page.value = 'select'
  currentWord.value = null
  hasSubmit.value = false
}
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.select-wrap, .quiz-wrap {
  max-width: 620px;
  margin: 0 auto;
  padding: 16px;
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

.card-title {
  text-align: center;
  margin: 0 0 24px 0;
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--text-primary);
  letter-spacing: 2px;
}

.form-item {
  margin-bottom: 20px;
}

.label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  font-weight: 600;
}

/* 单选组 */
.radio-group {
  display: flex;
  gap: 12px;
}

.radio-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
}

.radio-item.checked {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.radio-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.radio-item.checked .radio-dot {
  border-color: var(--accent);
}

.radio-item.checked .radio-dot::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

/* 选择框 */
.select-field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
}

.select-field:hover {
  border-color: var(--accent);
}

.select-arrow {
  color: var(--text-muted);
  font-size: 18px;
}

/* 等级选择弹窗 */
.level-popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 5000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.level-popup {
  width: 100%;
  max-width: 480px;
  background: rgba(10, 10, 15, 0.98);
  border: 1px solid var(--accent-border);
  border-radius: 20px 20px 0 0;
  padding: 20px;
  animation: slideUp 0.3s var(--ease-out);
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.popup-title {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
  font-family: var(--font-display);
  letter-spacing: 1px;
}

.level-option {
  padding: 16px;
  text-align: center;
  font-size: 16px;
  color: var(--text-secondary);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.level-option:hover {
  background: var(--bg-elevated);
}

.level-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
  border: 1px solid var(--accent);
}

.popup-cancel {
  padding: 14px;
  text-align: center;
  font-size: 15px;
  color: var(--text-muted);
  border-top: 1px solid var(--accent-border);
  margin-top: 8px;
  cursor: pointer;
}

/* 按钮组 */
.btn-group {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-group > * {
  flex: 1;
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

/* 空单词 */
.empty-word {
  text-align: center;
  padding: 40px 0;
}

.empty-word p {
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 20px;
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

@keyframes dialogPop {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
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
