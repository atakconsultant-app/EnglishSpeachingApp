# ScooPitch 翻訳表（練習の画面の追加分：詳細設定〈役割・場面／使いたい単語〉、前回の続きから、Feedback とまとめの表示）
# 各行: (日本語の原文, 韓国語, 繁体字中国語（台湾）, フランス語, スペイン語)

ROWS = [
# 詳細設定（練習モード・レベルの画面）
("詳細設定（任意）", "상세 설정(선택)", "進階設定（選填）", "Paramètres avancés (facultatif)", "Ajustes avanzados (opcional)"),
("役割・場面や、使いたい単語を決められます", "역할·상황이나 쓰고 싶은 단어를 정할 수 있어요", "可以設定角色・情境，以及想使用的單字", "Choisissez un rôle, une situation ou les mots que vous voulez utiliser", "Elige un papel, una situación o las palabras que quieres usar"),
("役割・場面", "역할·상황", "角色・情境", "Rôle et situation", "Papel y situación"),
("記事をもとに、あなたの立場と相手の役を決めて練習できます。", "기사를 바탕으로 당신의 입장과 상대의 역할을 정해 연습할 수 있어요.", "可以根據文章，決定你的立場和對方的角色來練習。", "À partir de l'article, définissez votre rôle et celui de vos interlocuteurs.", "A partir del artículo, define tu papel y el de tus interlocutores para practicar."),
("この記事に合う案を出す", "이 기사에 맞는 안 제안받기", "提出適合這篇文章的方案", "Proposer des idées pour cet article", "Sugerir ideas para este artículo"),
("例：あなたはMicrosoftの社員。ほかの2人は運用委託先の担当者。大規模障害の原因を調べる会議で、あなたが司会をする", "예: 당신은 Microsoft 직원. 다른 2명은 운영 위탁업체 담당자. 대규모 장애의 원인을 조사하는 회의에서 당신이 사회를 본다", "例：你是Microsoft的員工，另外2人是委外營運廠商的負責人。在調查大規模故障原因的會議上，由你擔任主持人", "Ex. : vous travaillez chez Microsoft, les 2 autres sont des prestataires d'exploitation. Vous animez la réunion sur la cause d'une panne majeure", "Ej.: trabajas en Microsoft y los otros 2 son de la empresa subcontratada de operaciones. Moderas la reunión sobre la causa de una gran caída"),
("使いたい単語・表現", "쓰고 싶은 단어·표현", "想使用的單字・表達", "Mots et expressions à utiliser", "Palabras y expresiones que quieres usar"),
("会話の中で使う場面をAIが作ります。カンマや読点で区切って5つまで。", "AI가 대화 속에서 쓸 기회를 만들어 줘요. 쉼표로 구분해 5개까지.", "AI會在對話中製造使用的機會。用逗號分隔，最多5個。", "L'IA crée des occasions de les utiliser pendant la conversation. Séparez-les par des virgules (5 maximum).", "La IA creará ocasiones para usarlas en la conversación. Sepáralas con comas (máximo 5)."),
("例：profound, context, basic", "예: profound, context, basic", "例：profound, context, basic", "Ex. : profound, context, basic", "Ej.: profound, context, basic"),
("先に練習モードを選んでください。", "먼저 연습 모드를 선택해 주세요.", "請先選擇練習模式。", "Choisissez d'abord un mode d'entraînement.", "Primero elige un modo de práctica."),
("記事「{title}」に合わせた案です。押すと下の欄に入ります。自由に書き換えてもOKです。", "기사 「{title}」에 맞춘 안이에요. 누르면 아래 칸에 들어가요. 자유롭게 고쳐 써도 돼요.", "這些是配合文章「{title}」的方案。點一下就會填入下方欄位，也可以自由修改。", "Idées adaptées à l'article « {title} ». Touchez-en une pour la copier ci-dessous ; vous pouvez la modifier librement.", "Ideas adaptadas al artículo «{title}». Toca una para copiarla abajo; puedes modificarla libremente."),
("案を作れませんでした。もう一度お試しください。", "안을 만들지 못했어요. 다시 시도해 주세요.", "無法產生方案，請再試一次。", "Impossible de proposer des idées. Veuillez réessayer.", "No se pudieron generar ideas. Inténtalo de nuevo."),
("使いたい単語：", "쓰고 싶은 단어:", "想使用的單字：", "Mots à utiliser :", "Palabras que quieres usar:"),
("使いたい単語", "쓰고 싶은 단어", "想使用的單字", "Mots à utiliser", "Palabras que quieres usar"),
("使えた単語", "사용한 단어", "用到的單字", "Mots utilisés", "Palabras usadas"),
# 前回の続きから・再読み込み
("前回の続きから", "지난번에 이어서", "從上次繼續", "Reprendre où j'en étais", "Continuar donde lo dejé"),
("新しく始める", "새로 시작하기", "重新開始", "Recommencer", "Empezar de nuevo"),
("ここから再開（前回：{d}）", "여기서부터 재개 (지난번: {d})", "從這裡繼續（上次：{d}）", "Reprise ici (dernière fois : {d})", "Se retoma aquí (última vez: {d})"),
("ここから再開", "여기서부터 재개", "從這裡繼續", "Reprise ici", "Se retoma aquí"),
("前回までの会話", "지난번까지의 대화", "先前的對話", "Conversation précédente", "Conversación anterior"),
("ここから今回の練習", "여기서부터 이번 연습", "以下是這次的練習", "Séance d'aujourd'hui à partir d'ici", "Práctica de hoy a partir de aquí"),
# まとめ：改善すべき表現
("あなたの英語", "당신의 영어", "你的英文", "Votre anglais", "Tu inglés"),
("より良い言い方", "더 좋은 표현", "更好的說法", "Formulation plus naturelle", "Una forma mejor"),
("理由", "이유", "理由", "Pourquoi", "Por qué"),
# Feedback の採点項目の説明
("的確さ", "적절성", "切題度", "Pertinence", "Pertinencia"),
("相手の発言や質問にかみ合った答えか", "상대의 말이나 질문에 맞는 대답인지", "回答是否切合對方的發言或問題", "La réponse correspond-elle à ce que l'autre a dit ou demandé ?", "¿La respuesta corresponde a lo que la otra persona dijo o preguntó?"),
("文法", "문법", "文法", "Grammaire", "Gramática"),
("語彙", "어휘", "詞彙", "Vocabulaire", "Vocabulario"),
("進行", "진행", "主持進行", "Animation", "Moderación"),
("意見を引き出す・まとめる・話を進める力", "의견을 끌어내고, 정리하고, 이야기를 진행하는 힘", "引導意見、整理重點、推進討論的能力", "Faire parler les participants, résumer et faire avancer la discussion", "Obtener opiniones, resumir y hacer avanzar la conversación"),
("具体性・説得力", "구체성·설득력", "具體性・說服力", "Concret et convaincant", "Concreto y convincente"),
("具体例や結果を挙げて、説得力のある答えか", "구체적인 예나 결과를 들어 설득력 있게 답했는지", "是否舉出具體例子或成果，回答有說服力", "La réponse est-elle convaincante, avec des exemples ou des résultats concrets ?", "¿Es una respuesta convincente, con ejemplos o resultados concretos?"),
("分かりやすさ", "알기 쉬움", "清晰度", "Clarté", "Claridad"),
("流暢さ", "유창성", "流暢度", "Aisance", "Fluidez"),
# 準備：相手の発言（訳）を隠したとき
("隠しています。まず英語のまま理解してみましょう", "숨겨 두었어요. 먼저 영어 그대로 이해해 보세요", "已隱藏。先試著直接用英文理解吧", "Masqué. Essayez d'abord de comprendre directement en anglais", "Oculto. Intenta primero entenderlo directamente en inglés"),
]
