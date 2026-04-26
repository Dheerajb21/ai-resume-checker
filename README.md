# AI Resume Checker

AI Resume Checker is an intelligent hiring and learning agent designed to assess a candidate's real-world technical proficiency based on a Job Description (JD) and their Resume. It conducts an open-ended, dynamic, multiple-choice assessment to uncover true skill levels, identify gaps, and automatically generate a personalized progression roadmap.

## 🚀 Key Features

*   **Context-Aware Assessment**: Automatically extracts required skills from a provided Job Description and cross-references them against the candidate's PDF Resume.
*   **Interactive MCQ Chat**: Assesses each required skill dynamically using Google's Gemini 2.0 Flash Lite AI. It generates structured Multiple Choice Questions (MCQs), auto-scores the user's input, and provides immediate explanation feedback.
*   **Intelligent Scoring Engine**: Assigns proficiency scores dynamically based on chat performance.
*   **Personalized Learning Dashboard**: Generates a visually stunning, premium UI dashboard detailing the candidate's overall score (out of 100), skill-by-skill breakdown, and a curated list of educational resources (articles, courses, videos) to bridge identified skill gaps.
*   **Exportable Plans**: Easily export the personalized learning roadmap as a structured JSON file.

## 🛠️ Tech Stack

*   **Frontend Framework**: React
*   **Styling**: Tailwind CSS (v4) & Lucide React (Icons)
*   **AI Engine**: Google Gemini API (`gemini-3.1-flash-lite-preview`)
*   **State Management**: React Hooks (useState, useEffect, useRef)

## 📋 Getting Started

### Prerequisites
*   Node.js installed (v18+ recommended)
*   A free Google AI Studio API key.

### Installation

1.  **Clone the repository and install dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Setup:**
    Create a `.env` file in the root of the project and add your Gemini API Key:
    ```env
    GEMINI_API_KEY="YOUR_GOOGLE_AI_STUDIO_KEY"
    GEMINI_MODEL="gemini-3.1-flash-lite-preview"
    ```

3.  **Run the Development Server:**
    ```bash
    npm run dev
    ```

4.  **Open in Browser:** Navigate to the `localhost` URL provided by Vite to interact with SkillProbe AI.

## 💡 How it Works

1.  **Phase 1 (Input)**: Submit your Job Description text and upload your Resume in PDF format.
2.  **Phase 2 (Assessing)**: The agent initiates a guided conversation. For each skill identified in the JD, it presents an interactive Multiple Choice Question. Feedback is instant, and progress is visually tracked.
3.  **Phase 3 (Dashboard)**: Once all skills are assessed, a comprehensive dashboard is revealed, showing your overall score and a personalized action plan with resources to master the required skills.
