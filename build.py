#!/usr/bin/env python3
"""
SpaceAI 打包脚本
用于自动化打包 Python 后端和 Electron 前端
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent

# 输出目录
OUTPUT_DIR = PROJECT_ROOT / "dist"

# Python 打包配置
PYTHON_OUTPUT_DIR = OUTPUT_DIR / "python"
PYTHON_EXE_NAME = "spaceai-backend.exe"

# Electron 打包配置
ELECTRON_OUTPUT_DIR = OUTPUT_DIR / "electron"

def run_command(cmd, cwd=None):
    """运行命令并返回结果"""
    print(f"运行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"命令失败: {result.stderr}")
        sys.exit(1)
    print(f"命令成功: {result.stdout}")
    return result

def setup_directories():
    """设置输出目录"""
    print("设置输出目录...")
    OUTPUT_DIR.mkdir(exist_ok=True)
    PYTHON_OUTPUT_DIR.mkdir(exist_ok=True)
    ELECTRON_OUTPUT_DIR.mkdir(exist_ok=True)

def package_python():
    """打包 Python 后端"""
    print("\n=== 打包 Python 后端 ===")
    
    # 安装依赖
    print("安装 Python 依赖...")
    run_command([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    
    # 安装 pyinstaller
    print("安装 PyInstaller...")
    run_command([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    # 打包为单文件，无控制台
    print("打包 Python 应用...")
    run_command([
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconsole",
        "--name", PYTHON_EXE_NAME,
        "--distpath", str(PYTHON_OUTPUT_DIR),
        "main.py"
    ])
    
    print(f"Python 打包完成，输出到: {PYTHON_OUTPUT_DIR}")

def package_electron():
    """打包 Electron 前端"""
    print("\n=== 打包 Electron 前端 ===")
    
    # 安装 npm 依赖
    print("安装 npm 依赖...")
    run_command(["npm", "install"])
    
    # 构建 Electron 应用
    print("构建 Electron 应用...")
    run_command(["npm", "run", "build"])
    
    print("Electron 打包完成")

def main():
    """主函数"""
    print("SpaceAI 打包脚本")
    print("=" * 50)
    
    try:
        setup_directories()
        package_python()
        package_electron()
        print("\n✅ 打包完成！")
        print(f"输出目录: {OUTPUT_DIR}")
    except Exception as e:
        print(f"❌ 打包失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
