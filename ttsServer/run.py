import os
import sys
from flask import Flask
from flask_socketio import SocketIO, Namespace
import dashscope
from dashscope.audio.asr import *
import ssl
import certifi
from client_manager import ClientManager

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")
client_manager = ClientManager()

class AudioNamespace(Namespace):
    def on_connect(self):
        client = client_manager.create_client(self)
        client_manager.initialize_recognition(client)

    def on_disconnect(self, *args):
        client_manager.stop_all_recognitions()

    def on_audio(self, data):
        for client in client_manager.get_clients():
            if hasattr(client, 'recognition'):
                try:
                    client.recognition.send_audio_frame(data)
                except Exception as e:
                    print(f'Recognition error: {str(e)}')
                    client_manager.initialize_recognition(client, format='pcm')

def init_dashscope_api_key():
    """
        Set your DashScope API-key. More information:
        https://github.com/aliyun/alibabacloud-bailian-speech-demo/blob/master/PREREQUISITES.md
    """
    if 'DASHSCOPE_API_KEY' in os.environ:
        dashscope.api_key = os.environ['DASHSCOPE_API_KEY']
    else:
        dashscope.api_key = 'DASHSCOPE_API_KEY'

socketio.on_namespace(AudioNamespace('/audio'))

if __name__ == '__main__':
    init_dashscope_api_key()
    socketio.run(app, host='0.0.0.0', port=8080, allow_unsafe_werkzeug=True)
