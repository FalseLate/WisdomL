<template>
  <div class="page-wrap">
    <!-- 初始选择页 -->
    <div v-if="page === 'select'" class="select-wrap">
      <div class="my-card">
        <h2 style="text-align:center;margin:0 0 24px 0;">单词刷题</h2>

        <div class="form-item">
          <div class="label">题目类型</div>
          <van-radio-group v-model="form.type" direction="horizontal">
            <van-radio name="option">四选一选择题</van-radio>
            <van-radio name="spell">拼写默写题</van-radio>
          </van-radio-group>
        </div>

        <div class="form-item">
          <div class="label">单词等级</div>
          <van-field
            v-model="form.level"
            is-link
            readonly
            placeholder="请选择"
            @click="showLevelPopup = true"
          />
        </div>

        <van-popup v-model:show="showLevelPopup" position="bottom">
          <van-picker
            :columns="levelColumns"
            @confirm="onLevelConfirm"
            @cancel="showLevelPopup=false"
          />
        </van-popup>

        <div class="btn-group">
          <van-button type="primary" size="large" @click="startQuiz">开始刷题</van-button>
          <van-button size="large" @click="openWordBook">生词本</van-button>
        </div>
      </div>
    </div>

    <!-- 刷题页面 -->
    <div v-if="page === 'quiz'" class="quiz-wrap">
      <div class="my-card">
        <!-- 关键：v-if 保护，currentWord为null，整块不渲染 -->
        <div v-if="currentWord">
          <div class="header-row">
            <h3 v-if="form.type === 'option'">{{ currentWord?.word }} &nbsp; {{ currentWord?.phonetic }}</h3>
            <h3 v-else>&nbsp;</h3>
            <van-button type="text" :loading="collectLoading" @click="addWordBook">加入生词本</van-button>
          </div>

          <!-- 选择题模式 -->
          <div v-if="form.type === 'option'">
            <p style="font-size:18px;margin:16px 0;">请选择正确释义：</p>
            <div class="option-list">
              <van-button
                v-for="item in optionList"
                :key="item"
                @click="selectAnswer(item)"
                :type="getBtnType(item)"
                block
                size="large"
                :disabled="hasSubmit"
                style="margin:8px 0;"
              >
                {{ item }}
              </van-button>
            </div>
          </div>

          <!-- 拼写默写模式 -->
          <div v-if="form.type === 'spell'">
            <p style="font-size:20px;margin:16px 0;">中文释义：{{ currentWord?.cnMean }}</p>
            <van-field
              v-model="userInput"
              placeholder="请输入英文单词"
              size="large"
              @keyup.enter="submitSpell"
              :disabled="hasSubmit"
            />
            <div style="margin-top:12px;">
              <van-button type="primary" @click="submitSpell" :disabled="hasSubmit">提交答案</van-button>
            </div>
          </div>

          <!-- 答题结果提示 -->
          <div v-if="hasSubmit" style="margin-top:20px;">
            <van-notice-bar
              :type="isCorrect ? 'success' : 'danger'"
              :text="isCorrect ? '回答正确 ✔' : `回答错误 ✘ 正确答案：${rightAnswer}`"
            />
          </div>

          <div style="margin-top:24px;display:flex;gap:12px;">
            <van-button type="primary" @click="nextWord">下一题</van-button>
            <van-button @click="backHome">返回首页</van-button>
          </div>
        </div>
        <!-- 单词为空提示 -->
        <div v-else style="text-align:center;padding:40px 0;">
          <p style="font-size:16px;color:#666;">暂无该等级单词，请先导入单词数据</p>
          <van-button style="margin-top:16px;" @click="backHome">返回选择页</van-button>
        </div>
      </div>
    </div>

    <!-- 生词本弹窗 -->
    <van-popup v-model:show="wordBookVisible" position="center" round style="width:90%;max-width:700px;height:70vh;">
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
                <van-button type="danger" size="mini" @click="removeWord(item.id)">删除</van-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="popup-footer">
        <van-button @click="wordBookVisible=false">关闭</van-button>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import {
  getRandomWord,
  checkSpellApi,
  checkOptionApi,
  addWordCollect,
  removeWordCollect,
  getMyCollectList
} from '../api/word'

const userId = ref(1)

const page = ref('select')
const form = reactive({
  type: 'option',
  level: '4'
})

const showLevelPopup = ref(false)
const levelColumns = [
  { text: '四级', value: '4' },
  { text: '六级', value: '6' }
]

// 初始为 null，不是空对象
const currentWord = ref(null)
const optionList = ref([])
const userInput = ref('')

const hasSubmit = ref(false)
const isCorrect = ref(false)
const rightAnswer = ref('')

const wordBookVisible = ref(false)
const wordBookList = ref([])
const collectLoading = ref(false)

const wrongMeans = ['苹果', '放弃', '思考', '学习', '城市', '河流', '电脑', '书籍']

function onLevelConfirm({ selectedOptions }) {
  form.level = selectedOptions[0].value
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
  optionList.value = []
  try {
    const res = await getRandomWord(form.level)
    // 判断返回数据
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

function getBtnType(text) {
  if (!hasSubmit.value || !currentWord.value) return 'default'
  const right = currentWord.value.cnMean
  if (text === right) return 'success'
  if (!isCorrect.value && text !== right) return 'danger'
  return 'default'
}

async function nextWord() {
  await fetchNewWord()
}

function backHome() {
  page.value = 'select'
  currentWord.value = null
  hasSubmit.value = false
}

onMounted(() => {

})
</script>

<style scoped>
.page-wrap {
  min-height: 100vh;
  padding: 20px 12px;
  box-sizing: border-box;
}
.select-wrap, .quiz-wrap {
  max-width: 620px;
  margin: 0 auto;
}
.my-card {
  background:#f7f8fa;
  padding:24px;
  border-radius:12px;
}
.form-item {
  margin-bottom:20px;
}
.label {
  font-size:15px;
  color:#333;
  margin-bottom:8px;
}
.btn-group {
  display:flex;
  gap:12px;
  margin-top:24px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap:8px;
}
.option-list {
  margin-top: 12px;
}
.popup-header {
  padding:16px;
  font-size:16px;
  font-weight:bold;
  text-align:center;
  border-bottom:1px solid #eee;
}
.table-wrap {
  padding:12px;
  overflow:auto;
  height: calc(100% - 110px);
}
.popup-footer {
  padding:12px;
  border-top:1px solid #eee;
  text-align:center;
}
.word-table {
  width:100%;
  border-collapse: collapse;
}
.word-table th,.word-table td {
  border:1px solid #eee;
  padding:10px;
}
.word-table th {
  background:#f7f8fa;
}
</style>
