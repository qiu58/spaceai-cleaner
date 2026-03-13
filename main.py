import os
import datetime
from github import Github
from openai import OpenAI
import requests
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PUSHDEER_KEY = os.getenv("PUSHDEER_KEY")
MY_VERCEL_URL = os.getenv("MY_VERCEL_URL")

g = Github(GITHUB_TOKEN)
client = OpenAI(api_key=OPENAI_API_KEY)

def search_repositories():
    keywords = ["RAG", "AI Agent", "LangChain"]
    since_date = datetime.datetime.utcnow() - datetime.timedelta(days=1)
    since_str = since_date.strftime("%Y-%m-%d")
    
    all_repos = []
    for keyword in keywords:
        query = f"{keyword} created:>{since_str}"
        repos = g.search_repositories(query=query, sort="stars", order="desc")
        for repo in repos[:15]:
            all_repos.append((repo, keyword))
    
    seen = set()
    unique_repos = []
    for repo, keyword in all_repos:
        if repo.full_name not in seen:
            seen.add(repo.full_name)
            unique_repos.append((repo, keyword))
            if len(unique_repos) >= 15:
                break
        if len(unique_repos) >= 15:
            break
    
    return unique_repos

def get_readme_content(repo):
    try:
        readme = repo.get_readme()
        return readme.decoded_content.decode("utf-8")
    except:
        return ""

def analyze_repos_with_ai(repos_with_keywords):
    repos_info = []
    for repo, keyword in repos_with_keywords:
        readme_content = get_readme_content(repo)[:4000]
        repos_info.append({
            "name": repo.full_name,
            "stars": repo.stargazers_count,
            "description": repo.description or "",
            "readme": readme_content,
            "keyword": keyword,
            "url": repo.html_url
        })
    
    prompt = f"""我有以下 {len(repos_info)} 个 GitHub 项目，请根据技术硬核程度（技术深度、创新性、实用性）从中精选出 5 个最优秀的项目。

项目列表：
"""
    for i, repo in enumerate(repos_info, 1):
        prompt += f"{i}. 项目名: {repo['name']}\n"
        prompt += f"   Stars: {repo['stars']}\n"
        prompt += f"   描述: {repo['description']}\n"
        prompt += f"   关键词: {repo['keyword']}\n"
        prompt += f"   README: {repo['readme'][:1000]}\n\n"
    
    prompt += """请按以下 JSON 格式返回结果，不要包含其他内容：
{
    "top_projects": [
        {
            "name": "项目名",
            "stars": 星数,
            "core_tech": "核心技术点（解决了什么痛点，100字以内）",
            "url": "GitHub链接",
            "keyword": "RAG/Agent"
        }
    ]
}
keyword 统一使用 RAG 或 Agent，不要用其他值。"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "你是一个专业的技术分析师，擅长评估开源项目的技术价值。"},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    
    import json
    result = json.loads(response.choices[0].message.content)
    return result["top_projects"]

def generate_markdown(top_projects):
    today = datetime.datetime.now().strftime("%Y年%m月%d日")
    markdown = f"# 🚀 每日 AI 技术精选 - {today}\n\n"
    
    for i, project in enumerate(top_projects, 1):
        zhihu_search = f"https://www.zhihu.com/search?q={project['name']}"
        xiaohongshu_search = f"https://www.xiaohongshu.com/search_result?keyword={project['name']}"
        star_link = f"https://{MY_VERCEL_URL}/star?repo={project['name']}&category={project['keyword']}"
        
        markdown += f"## {i}. {project['name']}\n\n"
        markdown += f"⭐ Stars: {project['stars']}\n\n"
        markdown += f"🔗 GitHub: [{project['url']}]({project['url']})\n\n"
        markdown += f"💡 核心技术: {project['core_tech']}\n\n"
        markdown += f"📚 教程搜索: [知乎]({zhihu_search}) | [小红书]({xiaohongshu_search})\n\n"
        markdown += f"⭐ 一键收藏: [{star_link}]({star_link})\n\n"
        markdown += "---\n\n"
    
    return markdown

def push_to_pushdeer(content):
    url = f"https://api2.pushdeer.com/message/push?pushkey={PUSHDEER_KEY}"
    data = {
        "text": "🚀 每日 AI 技术精选",
        "desp": content,
        "type": "markdown"
    }
    response = requests.post(url, data=data)
    return response.status_code == 200

def main():
    print("🔍 正在搜索 GitHub 仓库...")
    repos = search_repositories()
    print(f"✅ 找到 {len(repos)} 个候选项目")
    
    print("🤖 正在分析项目...")
    top_projects = analyze_repos_with_ai(repos)
    print(f"✅ 精选出 {len(top_projects)} 个硬核项目")
    
    print("📝 生成报告...")
    markdown = generate_markdown(top_projects)
    
    print("📤 推送到 PushDeer...")
    if push_to_pushdeer(markdown):
        print("✅ 推送成功！")
    else:
        print("❌ 推送失败")
    
    print("\n" + markdown)

if __name__ == "__main__":
    main()
