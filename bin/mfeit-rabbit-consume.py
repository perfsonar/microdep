#!/usr/bin/env python3
"""
Consume and print RabbitMQ messages

To set up RabbitMQ:

yum -y install python36-pika rabbitmq-server
systemctl enable --now rabbitmq-server
"""

import optparse
import pika
import sys

opt_parser = optparse.OptionParser()

opt_parser.add_option("--host",
                      help="Host name",
                      action="store", type="string",
                      default="localhost",
                      dest="host")

opt_parser.add_option("--queue",
                      help="Queue name",
                      action="store", type="string",
                      default="hello",
                      dest="queue")


(options, remaining_args) = opt_parser.parse_args()

if len(remaining_args) != 0:
    print("Unusable arguments: %s" % " ".join(remaining_args))
    exit(1)

    
connection = pika.BlockingConnection(
    pika.ConnectionParameters(host=options.host)
)

channel = connection.channel()

channel.queue_declare(queue=options.queue)

def callback(_ch, _method, _properties, body):
#    print("\nReceived %s\n" % (body.decode("ascii")))
    print("%s" % (body.decode("ascii")))

channel.basic_consume(callback, queue=options.queue, no_ack=True)

#print("Listening on %s@%s..." % (options.queue, options.host))

try:
    channel.start_consuming()
except KeyboardInterrupt:
    pass

exit(99)
