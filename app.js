const { ipcRenderer } = window.nodeRequire('electron');

let state = {
  currentView: 'home',
  currentDrive: null,
  currentData: null,
  history: [],
  selectedNode: null,
  tasks: [],
  sandboxItems: [],
  chart: null
};

const suggestedTasks = [
  { path: 'C:\\Windows\\Temp', desc: '系统临时文件' },
  { path: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Temp', desc: '用户临时文件' },
  { path: 'C:\\Users\\%USERNAME%\\Downloads', desc: '下载文件夹' }
];

const elements = {
  navBtns: document.querySelectorAll('.nav-btn'),
  views: document.querySelectorAll('.view'),
  scanBtns: document.querySelectorAll('.scan-btn'),
  backBtn: document.querySelector('.back-btn'),
  upBtn: document.getElementById('up-btn'),
  treemap: document.getElementById('treemap'),
  treemapLoading: document.getElementById('treemap-loading'),
  treemapEmpty: document.getElementById('treemap-empty'),

  currentDriveTitle: document.getElementById('current-drive-title'),
  contextMenu: document.getElementById('context-menu'),
  aiSidebar: document.getElementById('ai-sidebar'),
  sidebarContent: document.getElementById('sidebar-content'),
  closeSidebar: document.getElementById('close-sidebar'),
  confirmModal: document.getElementById('confirm-modal'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmDelete: document.getElementById('confirm-delete'),
  cancelDelete: document.getElementById('cancel-delete'),
  suggestedTasksList: document.getElementById('suggested-tasks'),
  taskList: document.getElementById('task-list'),
  addTaskBtn: document.getElementById('add-task-btn'),
  browsePathBtn: document.getElementById('browse-path-btn'),
  taskPath: document.getElementById('task-path'),
  taskPeriod: document.getElementById('task-period'),
  customPeriod: document.getElementById('custom-period'),
  taskTime: document.getElementById('task-time'),
  sandboxList: document.getElementById('sandbox-list'),
  emptySandbox: document.getElementById('empty-sandbox'),
  sandboxSize: document.getElementById('sandbox-size'),
  loadingOverlay: document.getElementById('loading-overlay'),
  progressContainer: document.getElementById('progress-container'),
  progressBar: document.getElementById('progress-bar'),

};

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showLoading() {
  elements.loadingOverlay.classList.add('show');
}

function hideLoading() {
  elements.loadingOverlay.classList.remove('show');
}

let progressInterval = null;

function startProgress() {
  elements.progressContainer.style.display = 'block';
  elements.progressBar.style.width = '0%';
  
  let progress = 0;
  progressInterval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress > 90) {
      progress = 90;
      clearInterval(progressInterval);
    }
    elements.progressBar.style.width = progress + '%';
  }, 200);
}

function finishProgress() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  elements.progressBar.style.width = '100%';
  setTimeout(() => {
    elements.progressContainer.style.display = 'none';
    elements.progressBar.style.width = '0%';
  }, 300);
}

function showTreemapLoading() {
  elements.treemap.style.display = 'none';
  elements.treemapEmpty.style.display = 'none';
  elements.treemapLoading.style.display = 'flex';
  startProgress();
}

function showTreemapEmpty() {
  elements.treemap.style.display = 'none';
  elements.treemapLoading.style.display = 'none';
  elements.treemapEmpty.style.display = 'flex';
  finishProgress();
}

function showTreemapContent() {
  elements.treemapLoading.style.display = 'none';
  elements.treemapEmpty.style.display = 'none';
  elements.treemap.style.display = 'block';
  finishProgress();
}

function switchView(viewName) {
  state.currentView = viewName;
  elements.navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  elements.views.forEach(view => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });
  
  if (viewName === 'sandbox') {
    loadSandbox();
  } else if (viewName === 'tasks') {
    renderTasks();
  }
}

function initChart() {
  if (state.chart) {
    state.chart.dispose();
  }
  state.chart = echarts.init(elements.treemap);
  
  window.addEventListener('resize', () => {
    if (state.chart) {
      state.chart.resize();
    }
  });
}

async function scanDisk(drive) {
  state.currentDrive = drive;
  elements.currentDriveTitle.textContent = `扫描 ${drive} 盘`;
  
  switchView('scan');
  showTreemapLoading();
  
  // 文案库
  const loadingTexts = [
    "正在卖命翻找角落里的隐藏文件...",
    "硬盘疯狂转动中，请稍候...",
    "马上就好，正在统计最后几个大块头...",
    "文件实在太多啦，CPU 正在疯狂运转..."
  ];
  
  let currentIndex = 0;
  const loadingTextElement = document.getElementById('loading-text');
  
  // 启动文案轮播定时器
  const intervalId = setInterval(() => {
    if (loadingTextElement) {
      loadingTextElement.textContent = loadingTexts[currentIndex];
      currentIndex = (currentIndex + 1) % loadingTexts.length;
    }
  }, 1500);
  
  try {
    const data = await ipcRenderer.invoke('scan-disk', drive);
    console.log("获取到的扫描数据:", data);
    
    if (!data || typeof data !== 'object') {
      console.error('无效的扫描数据:', data);
      showTreemapEmpty();
      return;
    }
    
    if (!data.children || data.children.length === 0) {
      showTreemapEmpty();
      return;
    }
    
    state.currentData = data;
    state.history = [data];
    
    updateUpButton();
    showTreemapContent();
    renderTreemap(data);
  } catch (error) {
    console.error('扫描失败:', error);
    showTreemapEmpty();
    alert('扫描失败: ' + (error.message || '未知错误'));
  } finally {
    // 清除定时器
    clearInterval(intervalId);
  }
}

function renderTreemap(data) {
  console.log('renderTreemap 被调用，数据:', data);
  
  if (!state.chart) {
    initChart();
  }
  
  if (!data || !data.children || data.children.length === 0) {
    showTreemapEmpty();
    return;
  }
  
  const chartData = convertToEChartsFormat(data);
  
  if (!chartData || !chartData.children || chartData.children.length === 0) {
    showTreemapEmpty();
    return;
  }
  
  const softColors = [
    '#CBE5E4', '#E3E2F0', '#ECDAEA', '#EAC8DF',
    '#EFE3DF', '#DCE8E5', '#C1DAE7', '#AFD8E4',
    '#9DCDE1', '#F1F2CF', '#EFEDDA', '#EFE9DD',
    '#EADDE5', '#F5E5E1', '#F8D6D4', '#F5C6C3',
    '#E6DAE8', '#DCD7E5', '#D1CFE4', '#CACDE4',
    '#BFC3E2', '#BEE0F2', '#B8DEF6', '#B5D8F1',
    '#ACD0EE'
  ];
  
  function assignSoftColors(node, startIndex = 0) {
    if (node.children && node.children.length > 0) {
      let colorIndex = startIndex;
      node.children.forEach((child, i) => {
        child.itemStyle = {
          color: softColors[colorIndex % softColors.length],
          borderColor: '#fff',
          borderWidth: 2,
          gapWidth: 2
        };
        colorIndex++;
        assignSoftColors(child, colorIndex);
      });
    }
    return node;
  }
  
  const coloredChartData = assignSoftColors(chartData, 0);
  
  const option = {
    tooltip: {
      formatter: function(info) {
        const path = info.data.path || info.name;
        const size = formatSize(info.value);
        return `<div style="padding:8px;">
          <div style="font-weight:bold;margin-bottom:4px;">${info.name}</div>
          <div style="color:#666;font-size:12px;margin-bottom:4px;">${path}</div>
          <div style="color:#667eea;font-weight:600;">${size}</div>
        </div>`;
      }
    },
    series: [
      {
        type: 'treemap',
        id: 'diskTreemap',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          position: 'inside',
          formatter: function(params) {
            if (!params || !params.data) return '';
            const name = params.name;
            const size = formatSize(params.value);
            return `${name}\n${size}`;
          },
          color: '#000000',
          fontSize: 11,
          fontWeight: 'normal',
          lineHeight: 16
        },
        upperLabel: {
          show: false
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
          gapWidth: 2
        },
        levels: [
          {
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 3,
              gapWidth: 3
            }
          },
          {
            colorSaturation: [0.95, 1],
            itemStyle: {
              borderColorSaturation: 0.7,
              gapWidth: 2,
              borderWidth: 2
            }
          },
          {
            colorSaturation: [0.9, 1],
            itemStyle: {
              borderColorSaturation: 0.6,
              gapWidth: 1,
              borderWidth: 1
            }
          }
        ],
        data: [coloredChartData]
      }
    ]
  };
  
  try {
    console.log('正在设置图表选项...');
    state.chart.setOption(option, true);
    console.log('图表选项设置完成');
  } catch (e) {
    console.error('图表渲染失败:', e);
    showTreemapEmpty();
    return;
  }
  
  state.chart.off('click');
  state.chart.on('click', function(params) {
    console.log('点击事件触发:', params);
    try {
      handleChartClick(params);
    } catch (e) {
      console.error('点击事件错误:', e);
    }
  });
  
  state.chart.off('contextmenu');
  state.chart.on('contextmenu', function(params) {
    console.log('右键事件触发:', params);
    try {
      handleChartContextMenu(params);
    } catch (e) {
      console.error('右键事件错误:', e);
    }
  });
}

function convertToEChartsFormat(node) {
  if (!node || typeof node !== 'object') {
    console.error('convertToEChartsFormat: Invalid node', node);
    return null;
  }
  
  const result = {
    name: node.name || 'Unknown',
    value: node.size || 0,
    path: node.path || '',
    sizeFormatted: formatSize(node.size || 0),
    children: node.children && Array.isArray(node.children) 
      ? node.children.map(child => convertToEChartsFormat(child)).filter(Boolean) 
      : undefined
  };
  return result;
}

async function handleChartClick(params) {
  console.log('handleChartClick 被调用，参数:', params);
  
  if (!params || !params.data) {
    console.log('无效的点击参数');
    return;
  }
  
  const path = params.data.path;
  console.log('点击路径:', path);
  
  if (!path) {
    console.log('没有路径信息');
    return;
  }
  
  showTreemapLoading(`正在加载 ${params.data.name}...`);
  
  // 文案库
  const loadingTexts = [
    "正在卖命翻找角落里的隐藏文件...",
    "硬盘疯狂转动中，请稍候...",
    "马上就好，正在统计最后几个大块头...",
    "文件实在太多啦，CPU 正在疯狂运转..."
  ];
  
  let currentIndex = 0;
  const loadingTextElement = document.getElementById('loading-text');
  
  // 启动文案轮播定时器
  const intervalId = setInterval(() => {
    if (loadingTextElement) {
      loadingTextElement.textContent = loadingTexts[currentIndex];
      currentIndex = (currentIndex + 1) % loadingTexts.length;
    }
  }, 1500);
  
  try {
    const scannedData = await ipcRenderer.invoke('scan-subdirectory', path);
    console.log('获取到的子目录数据:', scannedData);
    
    if (scannedData && scannedData.children && scannedData.children.length > 0) {
      state.history.push(scannedData);
      state.currentData = scannedData;
      
      updateUpButton();
      showTreemapContent();
      renderTreemap(scannedData);
    } else {
      showTreemapContent();
      renderTreemap(state.currentData);
      alert('该目录下没有子文件或无权限读取');
    }
  } catch (error) {
    console.error('加载子目录失败:', error);
    showTreemapContent();
    renderTreemap(state.currentData);
    alert('加载子目录失败: ' + error.message);
  } finally {
    // 清除定时器
    clearInterval(intervalId);
  }
}

function findNodeByPath(root, path) {
  if (root.path === path) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeByPath(child, path);
      if (found) return found;
    }
  }
  return null;
}

function updateParentSizes(node) {
  for (let i = state.history.length - 2; i >= 0; i--) {
    const parent = state.history[i];
    let newSize = 0;
    if (parent.children) {
      parent.children.forEach(child => {
        newSize += child.size;
      });
    }
    parent.size = newSize;
  }
}

function handleChartContextMenu(params) {
  console.log('右键事件参数:', params);
  
  if (!params || !params.data) {
    console.log('无效的右键事件参数');
    return;
  }
  
  if (params.event && params.event.event) {
    params.event.event.preventDefault();
    params.event.event.stopPropagation();
    
    const x = params.event.event.pageX;
    const y = params.event.event.pageY;
    
    state.selectedNode = params.data;
    
    elements.contextMenu.style.left = x + 'px';
    elements.contextMenu.style.top = y + 'px';
    elements.contextMenu.classList.add('show');
  }
}

function hideContextMenu() {
  elements.contextMenu.classList.remove('show');
}

function updateUpButton() {
  elements.upBtn.style.display = state.history.length > 1 ? 'inline-block' : 'none';
}



async function goUp() {
  if (state.history.length <= 1) return;
  
  state.history.pop();
  state.currentData = state.history[state.history.length - 1];
  
  updateUpButton();
  renderTreemap(state.currentData);
}

async function showAIExplanation() {
  hideContextMenu();
  if (!state.selectedNode) return;
  
  const filePath = state.selectedNode.path;
  const fileName = state.selectedNode.name;
  const size = state.selectedNode.value;
  console.log('AI 解释路径:', filePath);
  
  // 显示加载状态
  elements.sidebarContent.innerHTML = `
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <p style="margin-top:16px;font-size:14px;color:#666;">🤖 AI 正在深度分析该目录特征，请稍候...</p>
    </div>
  `;
  
  elements.aiSidebar.classList.add('open');
  
  try {
    const explanation = await ipcRenderer.invoke('ai-explain', { filePath, fileName, size });
    
    let riskBadgeClass, riskText;
    switch (explanation.risk_level) {
      case '极低风险':
        riskBadgeClass = 'risk-low';
        riskText = '🟢 极低风险';
        break;
      case '中等风险':
        riskBadgeClass = 'risk-medium';
        riskText = '🟡 中等风险';
        break;
      case '高危严禁':
        riskBadgeClass = 'risk-high';
        riskText = '� 高危严禁';
        break;
      default:
        riskBadgeClass = 'risk-medium';
        riskText = '🟡 中等风险';
    }
    
    elements.sidebarContent.innerHTML = `
      <div class="explanation-card">
        <h4 style="margin-bottom:12px;font-size:16px;">${state.selectedNode.name}</h4>
        <p style="color:#666;margin-bottom:12px;font-size:13px;word-break:break-all;">${state.selectedNode.path}</p>
        <div class="risk-badge ${riskBadgeClass}">${riskText}</div>
        <div style="margin-top:16px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;">📌 文件归属</div>
          <p style="line-height:1.5;">${explanation.file_category}</p>
        </div>
        <div style="margin-top:16px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;">📌 用途说明</div>
          <p style="line-height:1.5;">${explanation.purpose}</p>
        </div>
        <div style="margin-top:16px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;">💡 操作建议</div>
          <p style="line-height:1.5;font-weight:600;color:#667eea;">${explanation.action_suggestion}</p>
        </div>
        <p style="margin-top:20px;color:#888;font-size:13px;">大小: ${formatSize(state.selectedNode.value)}</p>
      </div>
    `;
  } catch (error) {
    console.error('AI 解释失败:', error);
    elements.sidebarContent.innerHTML = `
      <div class="error-card">
        <p style="color:#ff4757;font-size:14px;">❌ AI 分析失败，请稍后重试</p>
      </div>
    `;
  }
}

function showDeleteConfirm() {
  hideContextMenu();
  if (!state.selectedNode) return;
  
  console.log('安全删除路径:', state.selectedNode.path);
  
  elements.confirmMessage.textContent = `确定要将 "${state.selectedNode.name}" 移至隔离沙箱吗？`;
  elements.confirmModal.classList.add('show');
}

async function confirmDeleteFile() {
  elements.confirmModal.classList.remove('show');
  if (!state.selectedNode) return;
  
  try {
    await ipcRenderer.invoke('safe-delete', state.selectedNode.path);
    alert('✅ 已安全移入沙盒，原位置已清理。硬盘空间将在 15 天后自动释放。');
    
    // 局部数据刷新，而不是重新扫描整个磁盘
    if (state.currentData) {
      // 从当前数据中移除删除的节点
      removeNodeFromData(state.currentData, state.selectedNode.path);
      // 更新历史记录中的数据
      for (let i = 0; i < state.history.length; i++) {
        removeNodeFromData(state.history[i], state.selectedNode.path);
      }
      // 重新渲染图表
      renderTreemap(state.currentData);
    }
  } catch (e) {
    alert('❌ 删除失败: ' + e.message);
  }
}

function removeNodeFromData(data, path) {
  if (!data || !data.children) return;
  
  // 查找并移除目标节点
  const index = data.children.findIndex(child => child.path === path);
  if (index !== -1) {
    const removedSize = data.children[index].size;
    data.children.splice(index, 1);
    // 更新父节点大小
    updateParentSizes(data, removedSize);
    return true;
  }
  
  // 递归查找子节点
  for (const child of data.children) {
    if (removeNodeFromData(child, path)) {
      return true;
    }
  }
  
  return false;
}

function updateParentSizes(node, removedSize) {
  node.size -= removedSize;
  // 不需要递归向上更新，因为我们会遍历历史记录中的所有节点
}

function calculateNextRunTime(period, time) {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  const nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);
  
  // 如果今天的时间已经过了，就设置为明天
  if (nextRun < now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  // 添加周期天数（当天清理不需要加天数）
  if (period > 0) {
    nextRun.setDate(nextRun.getDate() + (period - 1));
  }
  
  return nextRun.getTime();
}

function renderTasks() {
  elements.suggestedTasksList.innerHTML = suggestedTasks.map(task => `
    <li>
      <div>
        <strong>${task.desc}</strong>
        <div style="font-size:13px;color:#888;">${task.path}</div>
      </div>
      <button class="btn-primary" style="padding:8px 16px;font-size:14px;" onclick="addSuggestedTask('${task.path}', '${task.desc}')">加入</button>
    </li>
  `).join('');
  
  elements.taskList.innerHTML = state.tasks.length ? state.tasks.map((task, index) => {
    let statusIcon, statusText, statusColor;
    switch (task.last_run_status) {
      case '成功':
        statusIcon = '🟢';
        statusText = '成功';
        statusColor = '#27ae60';
        break;
      case '失败':
        statusIcon = '🔴';
        statusText = '执行失败';
        statusColor = '#e74c3c';
        break;
      default:
        statusIcon = '🟡';
        statusText = '暂无记录';
        statusColor = '#f39c12';
    }
    
    const nextRunTime = task.next_run_time ? new Date(task.next_run_time) : null;
    const lastRunTime = task.last_run_time ? new Date(task.last_run_time) : null;
    
    return `
      <li style="padding:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <strong style="font-size:16px;">${task.desc || '自定义任务'}</strong>
            <div style="font-size:13px;color:#888;margin-top:8px;">${task.path}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">周期: ${task.period === 0 ? '当天' : `每 ${task.period} 天`}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">执行状态: ${lastRunTime ? lastRunTime.toLocaleString() : '未执行'} (${statusIcon}${statusText}${task.last_cleaned_size > 0 ? `，清理了 ${formatSize(task.last_cleaned_size)}` : ''})</div>
            <div style="font-size:12px;color:#667eea;margin-top:4px;">下次执行: ${nextRunTime ? nextRunTime.toLocaleString() : '未设置'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn-primary" style="padding:8px 16px;font-size:14px;" onclick="executeTask(${index})")>立即执行</button>
          <button class="btn-secondary" style="padding:8px 16px;font-size:14px;" onclick="removeTask(${index})")>删除任务</button>
        </div>
      </li>
    `;
  }).join('') : '<li style="color:#888;">暂无任务</li>';
  
  elements.suggestedTasksList.innerHTML = suggestedTasks.map(task => `
    <li>
      <div>
        <strong>${task.desc}</strong>
        <div style="font-size:13px;color:#888;">${task.path}</div>
      </div>
      <button class="btn-primary" style="padding:8px 16px;font-size:14px;" onclick="addSuggestedTask('${task.path}', '${task.desc}')">加入</button>
    </li>
  `).join('');
}

async function addSuggestedTask(path, desc) {
  const time = '00:00'; // 默认执行时间
  const task = {
    path,
    desc,
    period: 7,
    time: time,
    last_run_time: null,
    last_run_status: '等待中',
    last_cleaned_size: 0,
    next_run_time: calculateNextRunTime(7, time)
  };
  
  try {
    const result = await ipcRenderer.invoke('add-task', task);
    if (result.success) {
      await loadTasks();
    } else {
      alert('添加任务失败: ' + result.error);
    }
  } catch (error) {
    console.error('添加任务失败:', error);
    alert('添加任务失败: ' + error.message);
  }
}

async function removeTask(index) {
  const task = state.tasks[index];
  if (!task || !task.id) {
    state.tasks.splice(index, 1);
    renderTasks();
    return;
  }
  
  try {
    const result = await ipcRenderer.invoke('remove-task', task.id);
    if (result.success) {
      await loadTasks();
    } else {
      alert('删除任务失败: ' + result.error);
    }
  } catch (error) {
    console.error('删除任务失败:', error);
    alert('删除任务失败: ' + error.message);
  }
}

async function executeTask(index) {
  const task = state.tasks[index];
  if (!task || !task.id) {
    return;
  }
  
  try {
    showLoading();
    const result = await ipcRenderer.invoke('execute-task', task.id);
    hideLoading();
    
    if (result.success) {
      await loadTasks();
      alert(`✅ 任务执行成功！\n清理了 ${formatSize(result.cleanedSize)}`);
    } else {
      alert('任务执行失败: ' + result.error);
    }
  } catch (error) {
    hideLoading();
    console.error('执行任务失败:', error);
    alert('执行任务失败: ' + error.message);
  }
}

async function loadSandboxSize() {
  const size = await ipcRenderer.invoke('get-sandbox-size');
  elements.sandboxSize.textContent = formatSize(size);
}

async function loadSandbox() {
  const items = await ipcRenderer.invoke('get-sandbox');
  state.sandboxItems = items;
  renderSandbox();
  loadSandboxSize();
}

async function emptySandbox() {
  if (!confirm('确定要清空回收站并立即释放所有空间吗？此操作不可恢复！')) {
    return;
  }
  
  try {
    await ipcRenderer.invoke('empty-sandbox');
    alert('✅ 回收站已清空，空间已释放！');
    loadSandbox();
  } catch (e) {
    alert('❌ 清空回收站失败: ' + e.message);
  }
}

function renderSandbox() {
  if (state.sandboxItems.length === 0) {
    elements.sandboxList.innerHTML = '<div style="padding:40px;text-align:center;color:#888;">回收站为空</div>';
    return;
  }
  
  elements.sandboxList.innerHTML = state.sandboxItems.map((item, index) => {
    const deletedDate = new Date(item.deletedAt);
    const daysLeft = Math.ceil((item.deletedAt + item.keepDays * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
    
    return `
      <div class="sandbox-item">
        <div>
          <div style="font-weight:600;">${item.originalPath.split('\\').pop()}</div>
          <div style="font-size:12px;color:#888;word-break:break-all;">${item.originalPath}</div>
        </div>
        <div style="font-size:13px;">${deletedDate.toLocaleDateString()} ${deletedDate.toLocaleTimeString()}</div>
        <div style="font-size:13px;color:${daysLeft <= 3 ? '#ff4757' : '#666'};">剩余 ${daysLeft} 天</div>
        <button class="btn-primary" style="padding:8px 16px;font-size:14px;" onclick="restoreItem(${index})">还原</button>
      </div>
    `;
  }).join('');
}

async function restoreItem(index) {
  const item = state.sandboxItems[index];
  const success = await ipcRenderer.invoke('restore-file', item);
  if (success) {
    alert('✅ 文件已还原！');
  } else {
    alert('❌ 还原失败：文件不存在或无法访问');
  }
  loadSandbox();
}

async function browsePath() {
  try {
    const selectedPath = await ipcRenderer.invoke('select-directory');
    if (selectedPath) {
      elements.taskPath.value = selectedPath;
    }
  } catch (error) {
    console.error('选择路径失败:', error);
  }
}

async function loadTasks() {
  try {
    const tasks = await ipcRenderer.invoke('get-tasks');
    state.tasks = tasks;
    renderTasks();
  } catch (error) {
    console.error('加载任务失败:', error);
  }
}

function initEventListeners() {
  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      if (btn.dataset.view === 'tasks') {
        loadTasks();
      }
    });
  });
  
  elements.scanBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.scan-card');
      const drive = card.dataset.drive;
      scanDisk(drive);
    });
  });
  
  elements.backBtn.addEventListener('click', () => switchView('home'));
  elements.upBtn.addEventListener('click', goUp);
  
  document.addEventListener('click', hideContextMenu);
  
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.action === 'explain') {
        showAIExplanation();
      } else if (item.dataset.action === 'delete') {
        showDeleteConfirm();
      }
    });
  });
  
  elements.closeSidebar.addEventListener('click', () => {
    elements.aiSidebar.classList.remove('open');
  });
  
  elements.cancelDelete.addEventListener('click', () => {
    elements.confirmModal.classList.remove('show');
  });
  
  elements.confirmDelete.addEventListener('click', confirmDeleteFile);
  
  elements.addTaskBtn.addEventListener('click', async () => {
    const path = elements.taskPath.value.trim();
    if (!path) return;
    
    let period = 7;
    if (elements.taskPeriod.value === 'custom') {
      const customDays = parseInt(elements.customPeriod.value);
      if (customDays && customDays >= 1) {
        period = customDays;
      } else {
        alert('请输入有效的天数');
        return;
      }
    } else {
      period = parseInt(elements.taskPeriod.value);
    }
    
    const time = elements.taskTime.value || '00:00';
    
    const task = {
      path,
      desc: '自定义任务',
      period: period,
      time: time,
      last_run_time: null,
      last_run_status: '等待中',
      last_cleaned_size: 0,
      next_run_time: calculateNextRunTime(period, time)
    };
    
    try {
      const result = await ipcRenderer.invoke('add-task', task);
      if (result.success) {
        elements.taskPath.value = '';
        elements.customPeriod.value = '';
        elements.taskPeriod.value = '7';
        elements.taskTime.value = '';
        elements.customPeriod.style.display = 'none';
        await loadTasks();
      } else {
        alert('添加任务失败: ' + result.error);
      }
    } catch (error) {
      console.error('添加任务失败:', error);
      alert('添加任务失败: ' + error.message);
    }
  });
  
  elements.browsePathBtn.addEventListener('click', browsePath);
  
  elements.taskPeriod.addEventListener('change', function() {
    if (elements.taskPeriod.value === 'custom') {
      elements.customPeriod.style.display = 'inline-block';
    } else {
      elements.customPeriod.style.display = 'none';
    }
  });
  
  elements.emptySandbox.addEventListener('click', emptySandbox);
  
  // 刷新任务列表按钮
  const refreshTasksBtn = document.getElementById('refresh-tasks');
  if (refreshTasksBtn) {
    refreshTasksBtn.addEventListener('click', async () => {
      await loadTasks();
    });
  }
}

window.addSuggestedTask = addSuggestedTask;
window.removeTask = removeTask;
window.executeTask = executeTask;
window.restoreItem = restoreItem;
window.emptySandbox = emptySandbox;
window.browsePath = browsePath;

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initWelcomeModal();
});

function initWelcomeModal() {
  const welcomeModal = document.getElementById('welcome-modal');
  const startExperienceBtn = document.getElementById('start-experience');
  
  if (!welcomeModal || !startExperienceBtn) return;
  
  // 强制显示弹窗用于测试
  welcomeModal.style.display = 'flex';
  
  // 点击开始体验按钮
  startExperienceBtn.addEventListener('click', () => {
    // 暂时不设置访问标记，以便下次打开仍能看到弹窗
    
    // 添加淡出动画
    welcomeModal.classList.add('fade-out');
    const welcomeContent = welcomeModal.querySelector('.welcome-content');
    if (welcomeContent) {
      welcomeContent.classList.add('fade-out');
    }
    
    // 动画结束后隐藏弹窗
    setTimeout(() => {
      welcomeModal.style.display = 'none';
    }, 300);
  });
}
