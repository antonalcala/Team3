import Exceptions
import Network


class ImuIface:
    def __init__(self, network: Network):
        self.network = network

    def calibrate(self):
        return Exceptions.NotImplementedException

    def get_height(self):
        return Exceptions.NotImplementedException