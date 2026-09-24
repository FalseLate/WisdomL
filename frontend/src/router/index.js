import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { isLoggedIn } from '../utils/auth.js'


const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue') },
  { path: '/practice', name: 'practice', component: () => import('../views/PracticeView.vue'), meta: { requiresAuth: true } },
  { path: '/lazy-practice', name: 'lazy-practice', component: () => import('../views/LazyPracticeView.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue'), meta: { requiresAuth: true } },
  { path: '/question-bank', name: 'question-bank', component: () => import('../views/QuestionBankView.vue'), meta: { requiresAuth: true } },
  { path: '/wrong-questions', name: 'wrong-questions', component: () => import('../views/WrongQuestionsView.vue'), meta: { requiresAuth: true } },
  { path: '/review-today', name: 'review-today', component: () => import('../views/ReviewView.vue'), meta: { requiresAuth: true } },
  { path: '/error-stats', name: 'error-stats', component: () => import('../views/ErrorStatsView.vue'), meta: { requiresAuth: true } },
  { path: '/collections', name: 'collections', component: () => import('../views/CollectionsView.vue'), meta: { requiresAuth: true } },
  // /user-center 已废弃，统一使用 /profile（ProfileView 新版个人中心）
  // /favorites 已废弃，统一使用 /collections（CollectionsView）
  {
    path: '/word/book',
    name: 'WordBook',
    component: () => import('../views/WordBookView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/word/plan',
    name: 'WordPlan',
    component: () => import('../views/WordPlanView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/word/study',
    name: 'WordStudy',
    component: () => import('../components/WordStudy.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/word-quiz',
    redirect: '/word/home'
  },
  {
    path: '/word/home',
    name: 'WordHome',
    component: () => import('../views/WordHomeView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/word/my',
    name: 'WordMyStudy',
    component: () => import('../views/WordMyStudyView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/word/notebook',
    name: 'VocabNotebook',
    component: () => import('../views/VocabNotebookView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/word/english-wrong',
    name: 'EnglishWrongReview',
    component: () => import('../views/EnglishWrongReviewView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/wiki/mine',
    name: 'MyWiki',
    component: () => import('../views/MyWikiView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/study-map',
    name: 'StudyMap',
    component: () => import('../views/StudyMapView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/reading/home',
    name: 'ReadingHome',
    component: () => import('../views/ReadingHomeView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/reading/article',
    name: 'ReadingArticle',
    component: () => import('../views/ReadingArticleView.vue'),
    meta: { requiresAuth: true }
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

// 保存每个页面的滚动位置
const scrollPositions = {}

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // 浏览器前进/后退时，优先用保存的位置
    if (savedPosition) {
      return savedPosition
    }
    // 如果该页面有记录的滚动位置，恢复
    if (scrollPositions[to.fullPath] !== undefined) {
      return { top: scrollPositions[to.fullPath] }
    }
    // 否则滚动到顶部
    return { top: 0 }
  }
})

router.beforeEach((to, from, next) => {
  // 离开当前页面前保存滚动位置
  if (from.fullPath) {
    scrollPositions[from.fullPath] = window.scrollY
  }

  if (to.meta.requiresAuth && !isLoggedIn()) {
    sessionStorage.setItem('redirect', to.fullPath)
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register') && isLoggedIn()) {
    next('/')
  } else {
    next()
  }
})

export default router
