from typing import List
from flask_socketio import Namespace
from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

class Client:
    def __init__(self, namespace: Namespace):
        self.namespace = namespace
        self.recognition = None
        self.callback = ClientCallback()
        self.callback.set_client(self)

    def send(self, data):
        if isinstance(data, dict):
            self.namespace.emit('recognition', data)
        else:
            print(f'Warning: Attempting to send non-dict data: {data}')

class ClientCallback(RecognitionCallback):
    def __init__(self):
        self.client = None
        self.sentences = {}  # 使用字典存储句子，key 是 sentence_id

    def set_client(self, client: Client):
        self.client = client

    def on_open(self) -> None:
        print('RecognitionCallback open.')
        self.sentences = {}  # 重置句子字典

    def on_close(self) -> None:
        print('RecognitionCallback close.')
        self.sentences = {}  # 清空句子字典

    def on_complete(self) -> None:
        print('RecognitionCallback completed.')

    def on_error(self, message) -> None:
        print('RecognitionCallback task_id: ', message.request_id)
        print('RecognitionCallback error: ', message.message)
        if self.client:
            error_data = {'type': 'error', 'message': str(message.message)}
            self.client.send(error_data)

    def get_sorted_text(self):
        # 按句子ID排序并拼接所有句子
        sorted_sentences = sorted(self.sentences.items(), key=lambda x: int(x[0]))
        return ' '.join(text for _, text in sorted_sentences)

    def on_event(self, result: RecognitionResult) -> None:
        if self.client:
            sentence = result.get_sentence()
            if 'text' in sentence:
                current_sentence_id = sentence.get('sentence_id')
                current_text = sentence['text']
                is_end = RecognitionResult.is_sentence_end(sentence)

                # 更新句子字典
                if current_text:
                    self.sentences[current_sentence_id] = current_text

                # 构建响应
                response = {
                    'type': 'recognition',
                    'text': current_text,
                    'is_end': is_end,
                    'sentence_id': current_sentence_id,
                }

                if is_end:
                    response.update({
                        'request_id': result.get_request_id(),
                        'usage': result.get_usage(sentence),
                    })

                # 发送响应
                self.client.send(response)

class ClientManager:
    def __init__(self):
        self.clients: List[Client] = []

    def create_client(self, namespace: Namespace) -> Client:
        client = Client(namespace)
        self.clients.append(client)
        return client

    def remove_client(self, client: Client):
        if client in self.clients:
            self.clients.remove(client)

    def get_clients(self) -> List[Client]:
        return self.clients

    def clear_clients(self):
        self.clients.clear()

    def initialize_recognition(self, client: Client, format='webm'):
        recognition = Recognition(
            model='paraformer-realtime-v2',
            format=format,
            sample_rate=16000,
            semantic_punctuation_enabled=False,
            callback=client.callback,
            timeout=30000,
            max_retries=3
        )
        client.recognition = recognition
        recognition.start()

    def stop_all_recognitions(self):
        for client in self.clients:
            if hasattr(client, 'recognition') and client.recognition.is_running():
                client.recognition.stop()
        self.clear_clients()
