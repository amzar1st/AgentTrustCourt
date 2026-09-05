"""Compatibility helper for the GenLayer CLI configuration environment."""

import os

from dotenv import load_dotenv

load_dotenv()


def get_config() -> dict:
    return {
        "rpc_protocol": os.environ["RPCPROTOCOL"],
        "rpc_host": os.environ["RPCHOST"],
        "rpc_port": os.environ["RPCPORT"],
    }
