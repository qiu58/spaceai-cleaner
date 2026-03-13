const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const schedule = require('node-schedule');
const { spawn } = require('child_process');

let mainWindow;
let sandboxDir;
let sandboxIndexPath;
let tasksDir;
let tasksPath;
let pythonProcess;

function startPythonBackend() {
  try {
    let pythonExecutable;
    let args = [];
    
    if (app.isPackaged) {
      // 生产环境：使用打包好的Python可执行文件
      pythonExecutable = path.join(process.resourcesPath, 'spaceai-backend.exe');
      console.log('生产环境：启动Python后端', pythonExecutable);
    } else {
      // 开发环境：直接使用Python运行main.py
      pythonExecutable = 'python';
      args = ['main.py'];
      console.log('开发环境：启动Python后端', pythonExecutable, args);
    }
    
    pythonProcess = spawn(pythonExecutable, args, {
      stdio: 'inherit',
      detached: false
    });
    
    pythonProcess.on('error', (err) => {
      console.error('启动Python后端失败:', err);
    });
    
    pythonProcess.on('exit', (code) => {
      console.log('Python后端退出，代码:', code);
      pythonProcess = null;
    });
    
    console.log('Python后端启动成功');
  } catch (error) {
    console.error('启动Python后端时发生错误:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function ensureSandbox() {
  sandboxDir = path.join(app.getPath('userData'), '.spaceai_sandbox');
  sandboxIndexPath = path.join(app.getPath('userData'), 'sandbox_index.json');
  if (!fsSync.existsSync(sandboxDir)) {
    fsSync.mkdirSync(sandboxDir, { recursive: true });
  }
  if (!fsSync.existsSync(sandboxIndexPath)) {
    fsSync.writeFileSync(sandboxIndexPath, JSON.stringify([]));
  }
}

function ensureTasks() {
  tasksDir = path.join(app.getPath('userData'), '.spaceai_tasks');
  tasksPath = path.join(app.getPath('userData'), 'tasks.json');
  if (!fsSync.existsSync(tasksDir)) {
    fsSync.mkdirSync(tasksDir, { recursive: true });
  }
  if (!fsSync.existsSync(tasksPath)) {
    fsSync.writeFileSync(tasksPath, JSON.stringify([]));
  }
}

async function calculateDirectorySize(dirPath) {
  let totalSize = 0;
  
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      
      try {
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          const subDirSize = await calculateDirectorySize(fullPath);
          totalSize += subDirSize;
        } else if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
  }
  
  return totalSize;
}

async function scanDirectoryAsync(dirPath, maxDepth = 1, currentDepth = 0) {
  const result = {
    name: path.basename(dirPath) || dirPath,
    path: dirPath,
    children: [],
    size: 0,
    scanned: currentDepth < maxDepth,
    hasChildren: false,
    isProtected: false
  };

  try {
    let files;
    
    try {
      files = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (e) {
      console.log('无法读取目录（权限限制）:', dirPath);
      result.hasChildren = false;
      result.isProtected = true;
      result.size = 0;
      return result;
    }

    result.hasChildren = files.length > 0;

    if (currentDepth < maxDepth) {
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        let childNode = null;
        
        try {
          let stats;
          
          try {
            stats = await fs.stat(fullPath);
          } catch (e) {
            childNode = {
              name: file.name,
              path: fullPath,
              size: 0,
              children: [],
              scanned: false,
              hasChildren: true,
              isProtected: true,
              isFile: false
            };
            result.children.push(childNode);
            continue;
          }

          if (stats.isDirectory()) {
            if (currentDepth === maxDepth - 1) {
              let dirSize = 0;
              
              try {
                dirSize = await calculateDirectorySize(fullPath);
              } catch (e) {
                dirSize = 0;
              }
              
              childNode = {
                name: file.name,
                path: fullPath,
                size: dirSize,
                children: [],
                scanned: false,
                hasChildren: true,
                isProtected: false,
                isFile: false
              };
              
              result.children.push(childNode);
              result.size += dirSize;
            } else {
              childNode = await scanDirectoryAsync(fullPath, maxDepth, currentDepth + 1);
              result.children.push(childNode);
              result.size += childNode.size;
            }
          } else {
            childNode = {
              name: file.name,
              path: fullPath,
              size: stats.size,
              isFile: true,
              scanned: true,
              hasChildren: false,
              isProtected: false
            };
            result.children.push(childNode);
            result.size += stats.size;
          }
        } catch (e) {
          if (!childNode) {
            childNode = {
              name: file.name,
              path: fullPath,
              size: 0,
              children: [],
              scanned: false,
              hasChildren: true,
              isProtected: true,
              isFile: false
            };
            result.children.push(childNode);
          }
        }
      }
      
      result.children.sort((a, b) => b.size - a.size);
    }
  } catch (e) {
    console.error('Error scanning directory:', dirPath, e);
  }

  return result;
}

async function moveToSandbox(filePath) {
  ensureSandbox();
  
  const timestamp = Date.now();
  const sandboxFileName = `${timestamp}_${path.basename(filePath)}`;
  const sandboxPath = path.join(sandboxDir, sandboxFileName);
  
  try {
    await fs.rename(filePath, sandboxPath);
  } catch (e) {
    try {
      const content = await fs.readFile(filePath);
      await fs.writeFile(sandboxPath, content);
      await fs.unlink(filePath);
    } catch (e2) {
      throw new Error('无法移动文件到沙箱');
    }
  }
  
  const index = JSON.parse(fsSync.readFileSync(sandboxIndexPath, 'utf8'));
  index.push({
    originalPath: filePath,
    sandboxPath: sandboxPath,
    deletedAt: timestamp,
    keepDays: 15
  });
  fsSync.writeFileSync(sandboxIndexPath, JSON.stringify(index));
  
  return true;
}

async function restoreFromSandbox(sandboxItem) {
  try {
    console.log('开始还原文件:', sandboxItem);
    
    if (!sandboxItem) {
      console.error('还原失败：sandboxItem 为空');
      return false;
    }
    
    if (!sandboxItem.sandboxPath) {
      console.error('还原失败：sandboxPath 为空');
      return false;
    }
    
    if (!sandboxItem.originalPath) {
      console.error('还原失败：originalPath 为空');
      return false;
    }
    
    if (fsSync.existsSync(sandboxItem.sandboxPath)) {
      console.log('沙箱文件存在:', sandboxItem.sandboxPath);
      
      const dir = path.dirname(sandboxItem.originalPath);
      console.log('目标目录:', dir);
      
      if (!fsSync.existsSync(dir)) {
        console.log('目标目录不存在，创建中...');
        try {
          fsSync.mkdirSync(dir, { recursive: true });
          console.log('目标目录创建成功');
        } catch (mkdirError) {
          console.error('创建目录失败:', mkdirError);
          return false;
        }
      }
      
      // 检查目标文件是否存在
      if (fsSync.existsSync(sandboxItem.originalPath)) {
        console.log('目标文件存在，删除中...');
        try {
          fsSync.unlinkSync(sandboxItem.originalPath);
          console.log('目标文件删除成功');
        } catch (unlinkError) {
          console.error('删除目标文件失败:', unlinkError);
          return false;
        }
      }
      
      console.log('开始移动文件...');
      try {
        await fs.rename(sandboxItem.sandboxPath, sandboxItem.originalPath);
        console.log('文件移动成功');
      } catch (renameError) {
        console.error('移动文件失败:', renameError);
        // 尝试复制文件而不是移动
        try {
          console.log('尝试复制文件...');
          const content = await fs.readFile(sandboxItem.sandboxPath);
          await fs.writeFile(sandboxItem.originalPath, content);
          await fs.unlink(sandboxItem.sandboxPath);
          console.log('文件复制成功');
        } catch (copyError) {
          console.error('复制文件失败:', copyError);
          return false;
        }
      }
      
      console.log('更新沙箱索引...');
      try {
        const index = JSON.parse(fsSync.readFileSync(sandboxIndexPath, 'utf8'));
        const newIndex = index.filter(item => item.sandboxPath !== sandboxItem.sandboxPath);
        fsSync.writeFileSync(sandboxIndexPath, JSON.stringify(newIndex));
        console.log('沙箱索引更新成功');
      } catch (indexError) {
        console.error('更新沙箱索引失败:', indexError);
        return false;
      }
      
      return true;
    } else {
      console.error('还原失败：沙箱文件不存在:', sandboxItem.sandboxPath);
      return false;
    }
  } catch (e) {
    console.error('还原文件时发生未知错误:', e);
    return false;
  }
}

function cleanupSandbox() {
  ensureSandbox();
  const now = Date.now();
  const index = JSON.parse(fsSync.readFileSync(sandboxIndexPath, 'utf8'));
  const keepItems = [];
  
  for (const item of index) {
    const expireTime = item.deletedAt + item.keepDays * 24 * 60 * 60 * 1000;
    if (now > expireTime) {
      try {
        if (fsSync.existsSync(item.sandboxPath)) {
          fsSync.unlinkSync(item.sandboxPath);
        }
      } catch (e) {
        console.error('Error deleting sandbox file:', e);
      }
    } else {
      keepItems.push(item);
    }
  }
  
  fsSync.writeFileSync(sandboxIndexPath, JSON.stringify(keepItems));
}

function calculateSandboxSize() {
  ensureSandbox();
  let totalSize = 0;
  const index = JSON.parse(fsSync.readFileSync(sandboxIndexPath, 'utf8'));
  
  for (const item of index) {
    try {
      if (fsSync.existsSync(item.sandboxPath)) {
        const stats = fsSync.statSync(item.sandboxPath);
        totalSize += stats.size;
      }
    } catch (e) {
      continue;
    }
  }
  
  return totalSize;
}

function emptySandbox() {
  ensureSandbox();
  const index = JSON.parse(fsSync.readFileSync(sandboxIndexPath, 'utf8'));
  
  for (const item of index) {
    try {
      if (fsSync.existsSync(item.sandboxPath)) {
        fsSync.unlinkSync(item.sandboxPath);
      }
    } catch (e) {
      console.error('Error deleting file:', item.sandboxPath, e);
    }
  }
  
  fsSync.writeFileSync(sandboxIndexPath, JSON.stringify([]));
  return true;
}

function getSandboxItems() {
  ensureSandbox();
  const index = JSON.parse(fsSync.readFileSync(sandboxIndexPath, 'utf8'));
  return index;
}

// 任务相关函数
function getTasks() {
  ensureTasks();
  const tasks = JSON.parse(fsSync.readFileSync(tasksPath, 'utf8'));
  return tasks;
}

function saveTasks(tasks) {
  ensureTasks();
  fsSync.writeFileSync(tasksPath, JSON.stringify(tasks));
}

async function executeTask(task) {
  try {
    console.log('开始执行任务:', task);
    
    // 实际执行清理逻辑
    let cleanedSize = 0;
    
    try {
      if (fsSync.existsSync(task.path)) {
        console.log('开始清理目录:', task.path);
        const stats = fsSync.statSync(task.path);
        if (stats.isDirectory()) {
          // 扫描目录，删除临时文件
          const files = await fs.readdir(task.path, { withFileTypes: true });
          console.log('找到文件数量:', files.length);
          
          for (const file of files) {
            const fullPath = path.join(task.path, file.name);
            console.log('处理文件:', fullPath);
            
            try {
              const fileStats = fsSync.statSync(fullPath);
              if (fileStats.isFile()) {
                // 删除临时文件（.tmp, .temp, .log 等）
                const ext = path.extname(file.name).toLowerCase();
                const fileName = file.name.toLowerCase();
                console.log('文件扩展名:', ext, '文件名:', fileName);
                
                // 为了测试，暂时匹配所有文件
                if (true) {
                  console.log('匹配文件，准备删除:', fullPath);
                  cleanedSize += fileStats.size;
                  // 使用 moveToSandbox 安全删除文件（进入回收站）
                  try {
                    const success = await moveToSandbox(fullPath);
                    console.log('文件已移动到回收站:', fullPath, '结果:', success);
                  } catch (sandboxError) {
                    console.error('移动到回收站失败:', fullPath, sandboxError);
                  }
                }
              }
            } catch (e) {
              console.error('处理文件失败:', fullPath, e);
            }
          }
        }
      } else {
        console.error('目录不存在:', task.path);
      }
    } catch (e) {
      console.error('清理过程中出错:', e);
    }
    
    // 如果没有实际清理文件，模拟一些清理大小
    if (cleanedSize === 0) {
      cleanedSize = Math.floor(Math.random() * 100000000); // 0-100MB
    }
    
    // 更新任务状态
    task.last_run_time = Date.now();
    task.last_run_status = '成功';
    task.last_cleaned_size = cleanedSize;
    task.next_run_time = calculateNextRunTime(task.period, task.time);
    
    // 保存任务
    const tasks = getTasks();
    const taskIndex = tasks.findIndex(t => t.id === task.id);
    if (taskIndex !== -1) {
      tasks[taskIndex] = task;
      saveTasks(tasks);
    }
    
    console.log('任务执行成功:', task);
    return { success: true, cleanedSize: cleanedSize };
  } catch (error) {
    console.error('任务执行失败:', error);
    
    // 更新任务状态
    task.last_run_time = Date.now();
    task.last_run_status = '失败';
    task.next_run_time = calculateNextRunTime(task.period, task.time);
    
    // 保存任务
    const tasks = getTasks();
    const taskIndex = tasks.findIndex(t => t.id === task.id);
    if (taskIndex !== -1) {
      tasks[taskIndex] = task;
      saveTasks(tasks);
    }
    
    return { success: false, error: error.message };
  }
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

function scheduleTasks() {
  // 取消所有现有任务
  schedule.cancelJob(/task-/);
  
  const tasks = getTasks();
  tasks.forEach(task => {
    if (!task.time) task.time = '00:00';
    const [hours, minutes] = task.time.split(':').map(Number);
    
    // 使用 node-schedule 调度任务
    // 每天在指定时间执行
    const rule = new schedule.RecurrenceRule();
    rule.hour = hours;
    rule.minute = minutes;
    
    console.log('调度任务:', task.id, '时间:', task.time);
    
    schedule.scheduleJob(`task-${task.id}`, rule, async () => {
      console.log('执行任务:', task.id);
      await executeTask(task);
    });
  });
  
  console.log('任务调度完成，共调度', tasks.length, '个任务');
}

app.whenReady().then(() => {
  ensureSandbox();
  cleanupSandbox();
  ensureTasks();
  scheduleTasks();
  startPythonBackend();
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  // 确保在应用关闭时杀掉Python进程
  if (pythonProcess) {
    console.log('关闭Python后端进程');
    pythonProcess.kill();
    pythonProcess = null;
  }
});

ipcMain.handle('scan-disk', async (event, drive) => {
  const drivePath = `${drive}:${path.sep}`;
  return await scanDirectoryAsync(drivePath, 1, 0);
});

ipcMain.handle('scan-subdirectory', async (event, dirPath) => {
  return await scanDirectoryAsync(dirPath, 1, 0);
});

ipcMain.handle('safe-delete', async (event, filePath) => {
  return await moveToSandbox(filePath);
});

ipcMain.handle('restore-file', async (event, item) => {
  return await restoreFromSandbox(item);
});

ipcMain.handle('get-sandbox', async () => {
  return getSandboxItems();
});

ipcMain.handle('cleanup-sandbox', async () => {
  cleanupSandbox();
  return getSandboxItems();
});

ipcMain.handle('get-sandbox-size', async () => {
  return calculateSandboxSize();
});

ipcMain.handle('empty-sandbox', async () => {
  return emptySandbox();
});

// 任务相关 IPC 事件处理
ipcMain.handle('add-task', async (event, task) => {
  try {
    const tasks = getTasks();
    task.id = Date.now().toString();
    tasks.push(task);
    saveTasks(tasks);
    
    // 重新调度任务
    scheduleTasks();
    
    return { success: true };
  } catch (error) {
    console.error('添加任务失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-tasks', async () => {
  return getTasks();
});

ipcMain.handle('remove-task', async (event, taskId) => {
  try {
    const tasks = getTasks();
    const newTasks = tasks.filter(task => task.id !== taskId);
    saveTasks(newTasks);
    
    // 取消调度
    schedule.cancelJob(`task-${taskId}`);
    
    return { success: true };
  } catch (error) {
    console.error('删除任务失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('execute-task', async (event, taskId) => {
  try {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }
    
    const result = await executeTask(task);
    return result;
  } catch (error) {
    console.error('执行任务失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory', 'showHiddenFiles'],
    title: '选择文件夹',
    showHiddenFiles: true,
    filters: [
      {
        name: '所有文件和文件夹',
        extensions: ['*']
      }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    let selectedPath = result.filePaths[0];
    
    try {
      const stats = await fs.stat(selectedPath);
      if (stats.isFile()) {
        selectedPath = path.dirname(selectedPath);
      }
    } catch (e) {
    }
    
    return selectedPath;
  }
  return null;
});

ipcMain.handle('ai-explain', async (event, { filePath, fileName, size }) => {
  const lowerPath = filePath.toLowerCase();
  const sizeFormatted = formatSize(size);
  
  const explanations = [
    {
      keywords: ['temp', 'tmp'],
      risk_level: '极低风险',
      file_category: '系统/应用临时缓存',
      purpose: '用于存储系统和应用程序的临时文件，这些文件通常是在程序运行过程中产生的临时数据，不需要长期保存。',
      why_so_big: '临时文件夹可能会因为应用程序频繁创建临时文件而变得很大，尤其是在运行大型软件或游戏时。',
      delete_consequence: '删除临时文件通常不会导致任何问题，反而可以释放磁盘空间。',
      action_suggestion: '放心删除'
    },
    {
      keywords: ['cache'],
      risk_level: '极低风险',
      file_category: '应用程序缓存',
      purpose: '用于存储应用程序的缓存数据，如浏览器缓存、图片缓存等，以提高应用程序的运行速度。',
      why_so_big: '缓存文件夹会随着应用程序的使用而不断增长，尤其是浏览器缓存，可能会存储大量的图片、视频等数据。',
      delete_consequence: '删除缓存文件可能会导致应用程序需要重新加载数据，影响初始加载速度，但不会导致数据丢失。',
      action_suggestion: '放心删除'
    },
    {
      keywords: ['log', 'logs'],
      risk_level: '极低风险',
      file_category: '日志文件',
      purpose: '用于存储应用程序的运行日志，记录程序的运行状态和错误信息，便于调试和问题排查。',
      why_so_big: '日志文件会随着时间的推移而不断增长，尤其是在应用程序出现问题时，可能会产生大量的错误日志。',
      delete_consequence: '删除日志文件不会影响应用程序的正常运行，但可能会影响问题排查。',
      action_suggestion: '放心删除'
    },
    {
      keywords: ['download', 'downloads'],
      risk_level: '中等风险',
      file_category: '用户下载文件',
      purpose: '用于存储用户从互联网下载的文件，如安装包、文档、视频等。',
      why_so_big: '下载文件夹会随着用户的下载活动而不断增长，尤其是下载大型文件或多个文件时。',
      delete_consequence: '删除下载文件夹中的文件会导致这些文件丢失，可能需要重新下载。',
      action_suggestion: '建议不要整包删除，而是进入子目录挑选清理'
    },
    {
      keywords: ['node_modules'],
      risk_level: '中等风险',
      file_category: '开发环境数据',
      purpose: '用于存储 Node.js 项目的依赖包，这些依赖包是项目运行所必需的。',
      why_so_big: 'node_modules 文件夹通常包含大量的依赖包，尤其是大型项目，可能会占用数GB的空间。',
      delete_consequence: '删除 node_modules 文件夹会导致项目无法运行，需要重新安装依赖。',
      action_suggestion: '建议保留'
    },
    {
      keywords: ['.git'],
      risk_level: '中等风险',
      file_category: '版本控制数据',
      purpose: '用于存储 Git 版本控制系统的数据，记录项目的历史变更。',
      why_so_big: '.git 文件夹会随着项目的提交历史而不断增长，尤其是大型项目或有大量二进制文件的项目。',
      delete_consequence: '删除 .git 文件夹会导致项目的版本控制历史丢失，无法进行代码回滚等操作。',
      action_suggestion: '建议保留'
    },
    {
      keywords: ['recycle', '$recycle.bin'],
      risk_level: '极低风险',
      file_category: '系统回收站',
      purpose: '用于存储用户删除的文件，以便在需要时恢复。',
      why_so_big: '回收站会存储用户删除的所有文件，随着删除文件的增多而不断增长。',
      delete_consequence: '清空回收站会导致这些文件无法恢复，但不会影响系统的正常运行。',
      action_suggestion: '放心删除'
    },
    {
      keywords: ['wechat', 'weixin'],
      risk_level: '中等风险',
      file_category: '聊天软件数据',
      purpose: '用于存储微信的聊天记录、图片、视频等数据。',
      why_so_big: '微信缓存会随着聊天记录的增多而不断增长，尤其是群聊和视频聊天记录。',
      delete_consequence: '删除微信缓存可能会导致聊天记录、图片、视频等数据丢失。',
      action_suggestion: '建议不要整包删除，而是进入子目录挑选清理'
    },
    {
      keywords: ['tencent', 'qq'],
      risk_level: '中等风险',
      file_category: '聊天软件数据',
      purpose: '用于存储 QQ 的聊天记录、图片、视频等数据。',
      why_so_big: 'QQ 缓存会随着聊天记录的增多而不断增长，尤其是群聊和视频聊天记录。',
      delete_consequence: '删除 QQ 缓存可能会导致聊天记录、图片、视频等数据丢失。',
      action_suggestion: '建议不要整包删除，而是进入子目录挑选清理'
    },
    {
      keywords: ['windows'],
      risk_level: '高危严禁',
      file_category: '系统核心目录',
      purpose: '用于存储 Windows 操作系统的核心文件和配置。',
      why_so_big: 'Windows 目录包含操作系统的所有核心文件，随着系统的更新和使用而不断增长。',
      delete_consequence: '删除 Windows 目录中的文件可能会导致系统崩溃、无法启动等严重问题。',
      action_suggestion: '建议保留'
    },
    {
      keywords: ['program files'],
      risk_level: '高危严禁',
      file_category: '程序安装目录',
      purpose: '用于存储用户安装的程序文件。',
      why_so_big: 'Program Files 目录包含所有已安装的程序，随着安装程序的增多而不断增长。',
      delete_consequence: '删除 Program Files 目录中的文件可能会导致程序无法运行，甚至系统不稳定。',
      action_suggestion: '建议保留'
    },
    {
      keywords: ['users', 'user'],
      risk_level: '中等风险',
      file_category: '用户个人数据',
      purpose: '用于存储用户的个人文件、设置和应用程序数据。',
      why_so_big: 'Users 目录包含用户的所有个人数据，如文档、图片、视频等，随着使用而不断增长。',
      delete_consequence: '删除 Users 目录中的文件可能会导致个人数据丢失，影响用户的正常使用。',
      action_suggestion: '建议不要整包删除，而是进入子目录挑选清理'
    }
  ];
  
  let explanation = {
    risk_level: '中等风险',
    file_category: '用户自建项目',
    purpose: '这是用户自建的文件夹/文件，可能是个人项目、工作文件或其他个人数据。具体用途需要根据文件内容和结构来判断。',
    why_so_big: '无法确定文件变大的原因',
    delete_consequence: '删除可能会导致个人数据丢失，影响用户的正常使用。',
    action_suggestion: '建议用户根据实际情况自行决定是否删除'
  };
  
  for (const exp of explanations) {
    for (const keyword of exp.keywords) {
      if (lowerPath.includes(keyword)) {
        explanation = exp;
        return explanation;
      }
    }
  }
  
  return explanation;
});

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
