import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { isLoggedIn } from '../utils/auth.js'


const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue') },
  { path: '/practice', name: 'practice', component: () => import('../views/PracticeView.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue'), meta: { requiresAuth: true } },
  { path: '/question-bank', name: 'question-bank', component: () => import('../views/QuestionBankView.vue'), meta: { requiresAuth: true } },
  { path: '/wrong-questions', name: 'wrong-questions', component: () => import('../views/WrongQuestionsView.vue'), meta: { requiresAuth: true } },
  { path: '/collections', name: 'collections', component: () => import('../views/CollectionsView.vue'), meta: { requiresAuth: true } },
  { path: '/user-center', name: 'user-center', component: () => import('../views/UserCenter.vue') },
  { path: '/favorites', name: 'favorites', component: () => import('../views/FavoritesView.vue'), meta: { requiresAuth: true } },
  {
    path: '/word-quiz',
    name: 'WordQuiz',
    component: () => import('../components/WordStudy.vue')
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from, next) => {
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
